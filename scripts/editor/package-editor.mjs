import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir, mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const editorRoot = path.join(root, "packages/editor");
const require = createRequire(path.join(editorRoot, "package.json"));
const desktopRequire = createRequire(path.join(root, "apps/desktop/package.json"));
const ts = require("typescript");
const { build } = createRequire(desktopRequire.resolve("vite/package.json"))("esbuild");
const manifest = JSON.parse(await readFile(path.join(editorRoot, "package.json"), "utf8"));
const output = path.resolve(process.argv[2] ?? path.join(root, "output/editor-package"));
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(output, "package-"));
const entries = Object.entries(manifest.exports).filter(([, source]) => !source.endsWith(".css"));
const nameOf = key => (key === "." ? "index" : key.slice(2));
const entryPoints = Object.fromEntries(
  entries.map(([key, source]) => [nameOf(key), path.join(editorRoot, source)])
);
const peers = {
  react: "^19.2.0",
  "react-dom": "^19.2.0",
  slate: "0.126.2",
  "slate-dom": "0.126.0",
  "slate-react": "0.126.4",
  "slate-history": "0.113.1",
  "react-dnd": "^16.0.1",
  "react-dnd-html5-backend": "^16.0.1",
};
const runtime = await build({
  entryPoints,
  outdir: path.join(directory, "dist"),
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  metafile: true,
  minify: true,
  plugins: [
    {
      name: "shared-peers",
      setup(build) {
        build.onResolve({ filter: /^(?:react|slate)/ }, args => {
          if (
            !Object.keys(peers).some(name => args.path === name || args.path.startsWith(name + "/"))
          )
            return;
          return args.kind === "require-call"
            ? { path: args.path, namespace: "shared-peer" }
            : { path: args.path, external: true };
        });
        build.onLoad({ filter: /.*/, namespace: "shared-peer" }, args => ({
          contents: `import * as peer from ${JSON.stringify(args.path)}; module.exports = peer;`,
          loader: "js",
        }));
      },
    },
  ],
  chunkNames: "chunks/[name]-[hash]",
  assetNames: "assets/[name]-[hash]",
  loader: {
    ".css": "empty",
    ".svg": "dataurl",
    ".png": "file",
    ".woff": "file",
    ".woff2": "file",
    ".ttf": "file",
  },
});
for (const input of Object.keys(runtime.metafile.inputs)) {
  if (/^(?:apps\/|packages\/db-schema\/)/.test(input))
    throw new Error(`Editor 不得包含应用或数据库实现：${input}`);
  if (
    /tests\/fixtures\/plugins|src\/extensions\/(?:html|custom-block)\/|node_modules\/(?:abcjs|@babel\/standalone)\//.test(
      input
    )
  )
    throw new Error(`Editor 包包含已迁出实现：${input}`);
}
for (const [file, output] of Object.entries(runtime.metafile.outputs)) {
  if (
    !output.entryPoint ||
    path.resolve(root, output.entryPoint) === path.join(editorRoot, "renderer.ts")
  )
    continue;
  const pending = [file];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    const chunk = runtime.metafile.outputs[current];
    if (!chunk) throw new Error(`构建产物缺少模块：${current}`);
    for (const input of Object.keys(chunk.inputs)) {
      if (input.startsWith("packages/plugins/"))
        throw new Error(`普通 Editor 入口不得包含发布协议：${output.entryPoint} → ${input}`);
    }
    for (const dependency of chunk.imports) {
      if (!dependency.external) pending.push(dependency.path);
    }
  }
}
const { build: buildVite } = await import(pathToFileURL(desktopRequire.resolve("vite")).href);
const { default: tailwind } = await import(
  pathToFileURL(desktopRequire.resolve("@tailwindcss/vite")).href
);
await buildVite({
  root: editorRoot,
  base: "./",
  configFile: false,
  plugins: [tailwind()],
  logLevel: "warn",
  build: {
    outDir: path.join(directory, "dist"),
    emptyOutDir: false,
    cssMinify: true,
    rollupOptions: {
      input: path.join(editorRoot, "styles.css"),
      output: {
        assetFileNames: asset =>
          asset.names?.some(name => name.endsWith(".css"))
            ? "styles.css"
            : "assets/[name]-[hash][extname]",
      },
    },
  },
});

const compiledStyles = await readFile(path.join(directory, "dist/styles.css"), "utf8");
for (const match of compiledStyles.matchAll(/url\(\s*["']?([^\s)"']+)/g)) {
  const reference = match[1];
  if (/^(?:data:|https?:|#)/.test(reference)) continue;
  if (reference.startsWith("/")) throw new Error(`Editor 样式不得依赖部署根：${reference}`);
  await readFile(path.resolve(directory, "dist", reference));
}

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  declaration: true,
  emitDeclarationOnly: true,
  skipLibCheck: true,
  strict: false,
  esModuleInterop: true,
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
  rootDir: root,
  outDir: path.join(directory, "declarations"),
};
const graph = ts.createProgram(
  [...Object.values(entryPoints), path.join(root, "packages/shared/styles.d.ts")],
  options
);
const sources = graph
  .getSourceFiles()
  .filter(
    file => file.fileName.startsWith(root + "/") && !file.fileName.includes("/node_modules/")
  );
const declarations = new Map();
const program = ts.createProgram(
  sources.map(file => file.fileName),
  options
);
const result = program.emit(
  undefined,
  (_name, text, _bom, _error, sourceFiles) => {
    if (sourceFiles?.length === 1) declarations.set(sourceFiles[0].fileName, text);
  },
  undefined,
  true
);
if (result.emitSkipped)
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(
      [...ts.getPreEmitDiagnostics(program), ...result.diagnostics],
      {
        getCanonicalFileName: value => value,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }
    )
  );
const dependencies = { "@types/react": "19.2.0", "@types/react-dom": "19.2.0" };
const visited = new Set();
const targetOf = source =>
  "types/" + path.relative(root, source).replace(/\.(?:tsx?|jsx?)$/, ".d.ts");
async function copyDeclaration(source) {
  if (visited.has(source)) return;
  visited.add(source);
  const text =
    declarations.get(source) ??
    (source.endsWith(".d.ts") ? await readFile(source, "utf8") : undefined);
  if (!text) throw new Error(`缺少类型声明：${source}`);
  const ast = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true);
  const edits = [],
    pending = [];
  function visit(node) {
    if (
      ts.isStringLiteral(node) &&
      (ts.isImportDeclaration(node.parent) ||
        ts.isExportDeclaration(node.parent) ||
        ts.isModuleDeclaration(node.parent) ||
        (ts.isLiteralTypeNode(node.parent) && ts.isImportTypeNode(node.parent.parent)))
    ) {
      if (
        ts.isImportDeclaration(node.parent) &&
        !node.parent.importClause &&
        node.text.endsWith(".css")
      ) {
        edits.push([node.parent.getStart(ast), node.parent.end, ""]);
        return;
      }
      const selfEntry =
        node.text === "@tau/editor"
          ? "."
          : node.text.startsWith("@tau/editor/")
            ? "./" + node.text.slice("@tau/editor/".length)
            : undefined;
      const resolved =
        ts.resolveModuleName(node.text, source, options, ts.sys).resolvedModule ??
        (selfEntry && manifest.exports[selfEntry]
          ? { resolvedFileName: path.join(editorRoot, manifest.exports[selfEntry]) }
          : undefined);
      if (!resolved) throw new Error(`声明无法解析：${source} → ${node.text}`);
      const dependency = resolved.resolvedFileName;
      if (dependency.startsWith(root + "/") && !dependency.includes("/node_modules/")) {
        let relative = path.posix
          .relative(path.posix.dirname(targetOf(source)), targetOf(dependency))
          .replace(/\.d\.ts$/, "");
        if (!relative.startsWith(".")) relative = "./" + relative;
        edits.push([node.getStart(ast), node.end, JSON.stringify(relative)]);
        pending.push(dependency);
      } else if (!node.text.startsWith(".")) {
        let current = path.dirname(dependency);
        while (current !== path.dirname(current)) {
          try {
            const info = JSON.parse(ts.sys.readFile(path.join(current, "package.json")) ?? "null");
            if (info?.name && info.version) {
              if (!peers[info.name]) dependencies[info.name] = info.version;
              break;
            }
          } catch {
            /* 继续查找声明归属包。 */
          }
          current = path.dirname(current);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let rewritten = text;
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
    rewritten = rewritten.slice(0, start) + replacement + rewritten.slice(end);
  const target = path.join(directory, targetOf(source));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, rewritten);
  for (const dependency of pending) await copyDeclaration(dependency);
}
for (const source of Object.values(entryPoints)) await copyDeclaration(source);
const exports = Object.fromEntries(
  entries.map(([key, source]) => [
    key,
    {
      types: "./" + targetOf(path.join(editorRoot, source)),
      import: "./dist/" + nameOf(key) + ".js",
    },
  ])
);
exports["./styles.css"] = "./dist/styles.css";
for (const [key, source] of Object.entries(manifest.exports).filter(([, source]) =>
  source.endsWith(".css")
)) {
  if (key === "./styles.css") continue;
  if (key.startsWith("./theme/")) {
    const target = "./dist/" + key.slice(2);
    await mkdir(path.dirname(path.join(directory, target)), { recursive: true });
    await writeFile(path.join(directory, target), await readFile(path.join(editorRoot, source)));
    exports[key] = target;
  } else exports[key] = "./dist/styles.css";
}
await writeFile(
  path.join(directory, "package.json"),
  JSON.stringify(
    {
      name: "@xiongtao.xt/tau-editor",
      version: manifest.version,
      type: "module",
      license: "MIT",
      description: "Tau 通用编辑器：内核、内置扩展、编辑器 UI 与已编译样式",
      repository: { type: "git", url: "git+https://github.com/LastKnightCoder/editor.git" },
      publishConfig: { access: "public", registry: "https://registry.npmjs.org" },
      exports,
      dependencies,
      peerDependencies: peers,
      sideEffects: true,
    },
    null,
    2
  ) + "\n"
);
await writeFile(
  path.join(directory, "LICENSE"),
  await readFile(path.join(root, "scripts/plugins/template/LICENSE"))
);
const bundledLicenses = new Map();
for (const input of Object.keys(runtime.metafile.inputs).filter(name =>
  name.includes("node_modules/")
)) {
  let folder = path.dirname(path.resolve(root, input));
  while (folder !== path.dirname(folder)) {
    let info;
    try {
      info = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8"));
    } catch {
      folder = path.dirname(folder);
      continue;
    }
    if (info.name && info.version) {
      bundledLicenses.set(`${info.name}@${info.version}`, { folder, license: info.license });
      break;
    }
    folder = path.dirname(folder);
  }
}
const notices = ["# 第三方许可\n\n以下为构建依赖中的许可说明；共享 peer 依赖由消费方安装。\n"];
for (const [name, info] of [...bundledLicenses].sort(([a], [b]) => a.localeCompare(b))) {
  notices.push(`\n## ${name}\n\n${info.license ?? "许可见原包"}\n`);
  for (const file of (await readdir(info.folder)).filter(name =>
    /^(?:licen[cs]e|notice|copying)(?:\.|$)/i.test(name)
  )) {
    try {
      notices.push(
        "\n```text\n" + (await readFile(path.join(info.folder, file), "utf8")) + "\n```\n"
      );
    } catch {
      /* 许可目录由原包保留。 */
    }
  }
}
await writeFile(path.join(directory, "THIRD_PARTY_NOTICES.md"), notices.join(""));
await writeFile(
  path.join(directory, "README.md"),
  await readFile(path.join(editorRoot, "README.md"))
);
const archive = execFileSync(
  "npm",
  ["pack", "--ignore-scripts", "--json", "--pack-destination", output],
  { cwd: directory, encoding: "utf8" }
);
await writeFile(
  path.join(output, "report.json"),
  JSON.stringify(
    {
      directory,
      archive: JSON.parse(archive),
      modules: Object.keys(runtime.metafile.inputs),
      declarationFiles: visited.size,
      exports: Object.keys(exports),
      dependencies,
      peerDependencies: peers,
    },
    null,
    2
  ) + "\n"
);
console.log(archive);
