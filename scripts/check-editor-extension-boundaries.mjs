import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const editorRoot = resolve(root, "packages/editor");
const require = createRequire(resolve(editorRoot, "package.json"));
const ts = require("typescript");
const extensionNames = new Set([
  "@tau/editor-custom-block",
  "@tau/editor-diagram",
  "@tau/editor-html",
]);
const heavy = new Set(["mermaid", "abcjs", "plantuml-encoder", "@babel/standalone", "yjs"]);

const sourceFiles = directory =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "node_modules" || entry.name === "__tests__") return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const importsOf = file => {
  const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const imports = [];
  const visit = node => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      imports.push(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(ast) === "require") &&
      node.arguments.length &&
      ts.isStringLiteral(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return imports;
};

for (const file of [
  ...sourceFiles(resolve(editorRoot, "src")),
  resolve(editorRoot, "api.ts"),
  resolve(editorRoot, "markdown.ts"),
]) {
  for (const specifier of importsOf(file))
    assert(
      ![...extensionNames].some(name => specifier === name || specifier.startsWith(name + "/")),
      `内核反向引用扩展：${relative(root, file)} → ${specifier}`
    );
}
for (const name of ["editor-custom-block", "editor-diagram", "editor-html"]) {
  for (const file of sourceFiles(resolve(root, "packages", name, "src"))) {
    for (const specifier of importsOf(file)) {
      assert(
        !specifier.startsWith("@tau/editor") ||
          !/^@tau\/editor(?:\/|$)/.test(specifier) ||
          ["@tau/editor/api", "@tau/editor/api/services"].includes(specifier),
        `扩展深引内核：${relative(root, file)} → ${specifier}`
      );
      if (specifier.startsWith("."))
        assert(
          !resolve(dirname(file), specifier).startsWith(editorRoot + "/"),
          `扩展相对路径深引内核：${file}`
        );
    }
  }
}

const manifests = new Map(
  readdirSync(resolve(root, "packages"), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const manifest = JSON.parse(
        readFileSync(resolve(root, "packages", entry.name, "package.json"), "utf8")
      );
      return [manifest.name, manifest];
    })
);
const reachable = new Set();
const visitPackage = name => {
  if (reachable.has(name)) return;
  reachable.add(name);
  const manifest = manifests.get(name);
  if (manifest)
    Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    }).forEach(visitPackage);
};
visitPackage("@tau/editor");
for (const name of [...extensionNames, ...heavy])
  assert(!reachable.has(name), `内核依赖图仍包含 ${name}`);
assert(
  !Object.keys({
    ...manifests.get("@tau/markdown").dependencies,
    ...manifests.get("@tau/markdown").peerDependencies,
  }).includes("@tau/editor"),
  "Markdown 仍反向依赖 editor"
);

const hosts = [
  ["desktop", "src/utils/markdown.ts", "desktopMarkdown"],
  ["mobile", "src/services/editorMarkdown.ts", "mobileMarkdown"],
  ["blog", "src/services/editorMarkdown.ts", "blogMarkdown"],
  ["browser-extension", "src/services/editorMarkdown.ts", "extensionMarkdown"],
];

const serviceScript = `
  import { registerHooks } from 'node:module';
  import assert from 'node:assert/strict';
  registerHooks({resolve(specifier, context, next) {
    if (/^(react(?:-dom)?(?:\\/|$)|slate-(?:react|dom)|@tau\\/(?:ui(?:\\/|$)|editor$|editor\\/api$|shared$)|mermaid$|abcjs$|@babel\\/)/.test(specifier)) throw Error('纯服务入口连带加载 ' + specifier);
    return next(specifier, context);
  }});
  const { createServiceId } = await import('@tau/editor/api/services');
  const { IRuntimeStyleCompiler } = await import('@tau/shared/runtime-style');
  const { ITypstCompiler } = await import('@tau/editor-diagram/services');
  assert.equal(createServiceId('test').id, 'test');
  assert.equal(IRuntimeStyleCompiler.id, 'tau.host.runtime-style-compiler');
  assert.equal(ITypstCompiler.id, 'tau.diagram.typst-compiler');
  assert.equal(typeof document, 'undefined');
`;
execFileSync(process.execPath, ["--input-type=module", "-e", serviceScript], {
  cwd: resolve(root, "apps/desktop"),
  stdio: "pipe",
});

for (const [host, entry, exportName] of hosts) {
  const url = pathToFileURL(resolve(root, "apps", host, entry)).href;
  const script = `
    import { registerHooks } from 'node:module';
    import assert from 'node:assert/strict';
    registerHooks({resolve(specifier, context, next) {
      if (/^(react(?:-dom)?(?:\\/|$)|slate-(?:react|dom)|mermaid$|abcjs$|plantuml-encoder$|@babel\\/|@tau\\/(?:ui(?:\\/|$)|editor$|editor\\/api))/.test(specifier)) throw Error('headless 连带加载 ' + specifier);
      return next(specifier, context);
    }});
    const { ${exportName}: md } = await import(${JSON.stringify(url)});
    const fence = String.fromCharCode(96).repeat(3);
    for (const type of ['custom-block', 'mermaid', 'plantuml', 'abc', 'tikz', 'typst']) {
      const source = fence + type + '\\n源码\\n' + fence;
      const parsed = md.importFromMarkdownWithPositions(source);
      assert.equal(parsed.content[0].type, type);
      assert.equal(md.getMarkdown(parsed.content).trim(), source);
      assert.equal(md.getMarkdownWithPositions(parsed.content).markdown.trim(), source);
    }
    assert.equal(typeof document, 'undefined');
    for (const source of ['<div>HTML</div>', '<b>行内</b>']) {
      const parsed = md.importFromMarkdownWithPositions(source);
      assert.equal(md.getMarkdown(parsed.content).trim(), source);
      assert.equal(md.getMarkdownWithPositions(parsed.content).markdown.trim(), source);
    }
  `;
  execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
    { cwd: resolve(root, "apps", host), stdio: "pipe" }
  );
}

if (process.argv.includes("--bundle")) {
  const desktopRequire = createRequire(resolve(root, "apps/desktop/package.json"));
  const esbuild = createRequire(desktopRequire.resolve("vite/package.json"))("esbuild");
  const result = await esbuild.build({
    entryPoints: [resolve(editorRoot, "src/index.ts")],
    bundle: true,
    write: false,
    metafile: true,
    platform: "browser",
    format: "esm",
    outdir: resolve(root, "output/editor-boundary"),
    loader: { ".css": "empty", ".less": "empty", ".svg": "dataurl", ".png": "dataurl" },
    logLevel: "silent",
  });
  const inputs = Object.keys(result.metafile.inputs);
  for (const input of inputs)
    assert(
      !/(?:editor-diagram|editor-custom-block|editor-html|node_modules\/(?:mermaid|abcjs|plantuml-encoder|@babel\/standalone))/.test(
        input
      ),
      `内核实际加载图包含扩展实现：${input}`
    );
  console.log(`内核实际加载图：${inputs.length} 个模块，无已拆扩展及其重依赖`);
}
console.log("扩展 API、运行时依赖方向与四端 Node/headless codec 组合检查通过");
