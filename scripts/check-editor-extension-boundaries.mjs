import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const editorRoot = resolve(root, "packages/editor");
const require = createRequire(resolve(editorRoot, "package.json"));
const ts = require("typescript");
const editorManifest = JSON.parse(readFileSync(resolve(editorRoot, "package.json"), "utf8"));
const diagramManifest = JSON.parse(
  readFileSync(resolve(root, "editor-extensions/diagram/package.json"), "utf8")
);
assert(!diagramManifest.dependencies?.abcjs, "abcjs 只能由独立 ABC 插件携带");
assert(!diagramManifest.exports["./abc"], "不得恢复宿主 ABC 渲染入口");
assert(
  !Object.keys(editorManifest.exports).some(key => key.startsWith("./src")),
  "核心不得恢复 src 私有通配出口"
);
const extensionNames = new Set([
  "@example/editor-reminder",
  "@tau/editor-webview",
  "@tau/editor-custom-block",
  "@tau/editor-diagram",
  "@tau/editor-html",
  "@tau/editor-source-view",
  "@tau/editor-code-block",
  "@tau/editor-math",
  "@tau/editor-emoji",
  "@tau/editor-media",
  "@tau/editor-blockquote",
  "@tau/editor-callout",
  "@tau/editor-detail",
  "@tau/editor-highlight-block",
  "@tau/editor-tabs",
  "@tau/editor-table",
  "@tau/editor-list",
  "@tau/editor-header",
  "@tau/editor-link",
  "@tau/editor-annotation",
  "@tau/editor-comment",
  "@tau/editor-kbd",
  "@tau/editor-divide-line",
  "@tau/editor-front-matter",
  "@tau/editor-text-formatting",
  "@tau/editor-underline",
  "@tau/editor-styled-text",
  "@tau/chat-ui",
]);
const heavy = new Set([
  "mermaid",
  "abcjs",
  "plantuml-encoder",
  "@babel/standalone",
  "yjs",
  "codemirror",
  "react-codemirror2",
  "shiki",
  "shiki-magic-move",
  "katex",
  "rehype-katex",
  "@emoji-mart/react",
  "@emoji-mart/data",
]);
const listDependencies = new Set(["@emoji-mart/react", "@emoji-mart/data"]);

// 本地产物不参与源码边界检查，排除范围与 antd 门禁保持一致。
const ignoredDirectories = new Set([
  "node_modules",
  "__tests__",
  ".git",
  "dist",
  "dist-electron",
  "output",
  "release",
  ".output",
  ".wxt",
]);

const sourceFiles = directory =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const importsOf = file => {
  const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const imports = [];
  const visit = node => {
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) imports.push(node.name.text);
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
assert(!existsSync(resolve(root, "plugins/headless-codecs.ts")), "不得恢复固定插件 codec 聚合表");
for (const file of [
  "apps/desktop/src/utils/markdown.ts",
  "apps/desktop/src/utils/htmlSerializerRegistry.ts",
  "apps/desktop/src/services/editorKit.ts",
  "apps/desktop/src/services/plugin-markdown.ts",
  ...sourceFiles(resolve(root, "apps/desktop/shared")),
]) {
  for (const specifier of importsOf(resolve(root, file)))
    assert(
      !/app\/plugins\//.test(specifier),
      `通用转换与编辑器服务不得反向依赖渲染层插件状态：${file}`
    );
}
assert(
  !existsSync(resolve(root, "editor-extensions/custom-block/package.json")),
  "旧 custom-block 编辑器扩展包必须退役"
);
for (const host of ["desktop", "mobile", "browser-extension", "blog"]) {
  const manifest = JSON.parse(readFileSync(resolve(root, "apps", host, "package.json"), "utf8"));
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }))
    assert(
      !["@tau/editor-custom-block", "@tau/plugin-custom-block"].includes(name),
      `${host} 不得依赖具体插件源码包`
    );
  for (const file of sourceFiles(resolve(root, "apps", host, "src")))
    for (const specifier of importsOf(file))
      assert(
        !/@tau\/(?:editor-custom-block|plugin-custom-block)|plugins\/[^/]+\/src\//.test(specifier),
        `宿主不得直接导入插件源码：${relative(root, file)} → ${specifier}`
      );
}
for (const directory of ["apps", "packages", "editor-extensions", "examples"]) {
  for (const file of sourceFiles(resolve(root, directory))) {
    if (/\.test\.tsx?$/.test(file) || /\/test-setup\.tsx?$/.test(file)) continue;
    for (const specifier of importsOf(file)) {
      assert(
        !/^@tau\/editor\/src(?:\/|$)/.test(specifier),
        `旧编辑器入口回流：${relative(root, file)}`
      );
      if (!file.startsWith(editorRoot + "/") && specifier.startsWith("."))
        assert(
          !resolve(dirname(file), specifier).startsWith(editorRoot + "/src/"),
          `生产代码深引核心实现：${relative(root, file)}`
        );
    }
  }
}

const apiAst = ts.createSourceFile(
  "api/index.ts",
  readFileSync(resolve(editorRoot, "src/api/index.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true
);
for (const declaration of apiAst.statements) {
  if (
    !ts.isExportDeclaration(declaration) ||
    !declaration.exportClause ||
    !ts.isNamedExports(declaration.exportClause)
  )
    continue;
  for (const entry of declaration.exportClause.elements)
    assert(
      !["EditorContextMenu", "ContextMenuItem"].includes(entry.name.text),
      "扩展 API 不得公开内核低级菜单回调入口"
    );
}

for (const file of [
  "src/index.ts",
  "src/api/index.ts",
  "src/services/index.ts",
  "src/services/tokens.ts",
  "src/types/index.ts",
]) {
  const ast = ts.createSourceFile(
    file,
    readFileSync(resolve(editorRoot, file), "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const hostNames = [
    "IResourceService",
    "IFileService",
    "IOpenerService",
    "ResourceService",
    "FileService",
    "OpenerService",
  ];
  for (const statement of ast.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    assert(
      statement.moduleSpecifier?.text !== "@tau/shared/host-services",
      `核心不得反向转出宿主契约：${file}`
    );
    if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const entry of statement.exportClause.elements) {
        assert(
          !hostNames.includes((entry.propertyName ?? entry.name).text),
          `宿主服务只能由 shared/host-services 导出：${file}`
        );
      }
    }
  }
}

for (const file of [
  ...sourceFiles(resolve(editorRoot, "src")),
  resolve(editorRoot, "api.ts"),
  resolve(editorRoot, "markdown.ts"),
]) {
  for (const specifier of importsOf(file)) {
    assert(
      ![...extensionNames].some(name => specifier === name || specifier.startsWith(name + "/")),
      `内核反向引用扩展：${relative(root, file)} → ${specifier}`
    );
    assert(
      ![...listDependencies].some(name => specifier === name || specifier.startsWith(name + "/")),
      `核心不得引用列表图标依赖：${relative(root, file)} → ${specifier}`
    );
  }
}
for (const file of sourceFiles(resolve(root, "packages/shared"))) {
  for (const specifier of importsOf(file))
    assert(
      !/^@tau\/editor(?:[/-]|$)/.test(specifier) && !/^@tau\/chat-ui(?:\/|$)/.test(specifier),
      `shared 反向引用编辑器或展示包：${relative(root, file)} → ${specifier}`
    );
}

for (const directory of [
  "editor-extensions/webview",
  "editor-extensions/diagram",
  "editor-extensions/html",
  "packages/editor-source-view",
  "editor-extensions/code-block",
  "editor-extensions/math",
  "editor-extensions/emoji",
  "editor-extensions/media",
  "editor-extensions/blockquote",
  "editor-extensions/callout",
  "editor-extensions/detail",
  "editor-extensions/highlight-block",
  "editor-extensions/tabs",
  "editor-extensions/table",
  "editor-extensions/list",
  "editor-extensions/header",
  "editor-extensions/link",
  "editor-extensions/annotation",
  "editor-extensions/comment",
  "editor-extensions/kbd",
  "editor-extensions/divide-line",
  "editor-extensions/front-matter",
  "editor-extensions/text-formatting",
  "editor-extensions/underline",
  "editor-extensions/styled-text",
]
  .map(directory => directory + "/src")
  .concat(["examples/editor-reminder/src/extension"])) {
  for (const file of sourceFiles(resolve(root, directory))) {
    for (const specifier of importsOf(file)) {
      assert(
        !specifier.startsWith("@tau/editor") ||
          !/^@tau\/editor(?:\/|$)/.test(specifier) ||
          ["@tau/editor/api", "@tau/editor/api/services", "@tau/editor/api/paragraph"].includes(
            specifier
          ),
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

const exampleRoot = resolve(root, "examples/editor-reminder");
const exampleEditorEntries = new Set([
  "@tau/editor",
  "@tau/editor/api",
  "@tau/editor/api/services",
  "@tau/editor/api/paragraph",
  "@tau/editor/markdown",
]);
for (const file of sourceFiles(exampleRoot)) {
  for (const specifier of importsOf(file)) {
    if (/^@tau\/editor(?:\/|$)/.test(specifier))
      assert(exampleEditorEntries.has(specifier), `示例使用核心私有入口：${specifier}`);
    if (specifier.startsWith("."))
      assert(
        resolve(dirname(file), specifier).startsWith(exampleRoot + "/"),
        `示例跨目录读取实现：${file}`
      );
  }
}
for (const name of ["tsconfig.json", "tsconfig.markdown.json"])
  assert(
    !JSON.parse(readFileSync(resolve(exampleRoot, name), "utf8")).extends,
    "示例必须自有类型配置"
  );
for (const name of ["vite.config.ts", "vitest.config.ts"])
  assert(!/\balias\s*:/.test(readFileSync(resolve(exampleRoot, name), "utf8")), "示例禁止解析别名");

const manifests = new Map(
  ["packages", "editor-extensions", "examples"].flatMap(directory =>
    readdirSync(resolve(root, directory), { withFileTypes: true })
      .filter(
        entry =>
          entry.isDirectory() && existsSync(resolve(root, directory, entry.name, "package.json"))
      )
      .map(entry => {
        const manifest = JSON.parse(
          readFileSync(resolve(root, directory, entry.name, "package.json"), "utf8")
        );
        return [manifest.name, manifest];
      })
  )
);
const reachable = new Set();
for (const name of ["@tau/editor", "@tau/markdown"]) {
  const manifest = manifests.get(name);
  assert(
    !Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
    }).includes("@tau/db-schema"),
    `${name} 不得依赖产品数据库及退役规则`
  );
}
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
  assert(!reachable.has(name), `包级依赖约束未满足（不等同于入口加载）：${name}`);
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
    if (/^(react(?:-dom)?(?:\\/|$)|slate-(?:react|dom)|@tau\\/(?:ui(?:\\/|$)|editor$|editor\\/api$|shared$|chat-ui$)|mermaid$|abcjs$|@babel\\/)/.test(specifier)) throw Error('纯入口连带加载 ' + specifier);
    return next(specifier, context);
  }});
  const { createServiceId } = await import('@tau/editor/api/services');
  const { createParagraph, isParagraphElement } = await import('@tau/editor/api/paragraph');
  assert.equal(isParagraphElement(createParagraph()), true);
  const { IRuntimeStyleCompiler } = await import('@tau/shared/runtime-style');
  const { IResourceService, IFileService, IOpenerService } = await import('@tau/shared/host-services');
  assert.equal(IResourceService.id, 'resourceService');
  assert.equal(IFileService.id, 'fileService');
  assert.equal(IOpenerService.id, 'openerService');
  const { IEditorSlots, IMediaInsertSources, IVideoContentProviders, IMediaActions, IMediaSelectors } =
    await import('@tau/editor-media/services');
  assert.deepEqual([IEditorSlots, IMediaInsertSources, IVideoContentProviders, IMediaActions, IMediaSelectors].map(token => token.id),
    ['editorSlots', 'mediaInsertSources', 'videoContentProviders', 'mediaActions', 'mediaSelectors']);
  const { ITypstCompiler } = await import('@tau/editor-diagram/services');
  assert.equal(createServiceId('test').id, 'test');
  assert.equal(IRuntimeStyleCompiler.id, 'tau.host.runtime-style-compiler');
  assert.equal(ITypstCompiler.id, 'tau.diagram.typst-compiler');
  const { getCodeBlockController } = await import('@tau/editor-code-block/runtime');
  assert.equal(getCodeBlockController('missing'), undefined);
  const sharedDisplay = await import('@tau/shared/chat-renderers');
  assert.equal('registerToolCallRenderer' in sharedDisplay, false);
  assert.equal(sharedDisplay.getDisplayTextFromBlocks([{type: 'text', content: '消息'}]), '消息');
  const { registerToolCallRenderer, getToolCallRenderer, unregisterToolCallRenderer } = await import('@tau/chat-ui/renderers');
  const renderer = () => null;
  registerToolCallRenderer('headless-check', renderer);
  assert.equal(getToolCallRenderer('headless-check'), renderer);
  assert.equal(unregisterToolCallRenderer('headless-check'), true);
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
      if (specifier !== '@tau/editor/api/paragraph' && /^(react(?:-dom)?(?:\\/|$)|slate-(?:react|dom)|mermaid$|abcjs$|plantuml-encoder$|@babel\\/|@tau\\/(?:ui(?:\\/|$)|editor$|editor\\/api))/.test(specifier)) throw Error('headless 连带加载 ' + specifier);
      return next(specifier, context);
    }});
    const { ${exportName}: md } = await import(${JSON.stringify(url)});
    const formatted = '**bold** :gradient[color]{preset=ocean}';
    const formattedValue = md.importFromMarkdown(formatted);
    assert.equal(formattedValue[0].children[0].bold, true);
    assert.equal(md.getMarkdown(formattedValue).trim(), formatted);
    const unknownText = [{ type: 'paragraph', children: [{ type: 'formatted', text: 'a[b]', vendor: { rating: 2 } }] }];
    const preserved = md.getMarkdownWithPositions(unknownText);
    assert.deepEqual(md.importFromMarkdown(preserved.markdown), unknownText);
    assert.deepEqual(md.importFromMarkdownWithPositions(preserved.markdown).content, unknownText);
    const fence = String.fromCharCode(96).repeat(3);
    for (const type of ['mermaid', 'plantuml']) {
      const source = fence + type + '\\n源码\\n' + fence;
      const parsed = md.importFromMarkdownWithPositions(source);
      assert.equal(parsed.content[0].type, type);
      assert.equal(md.getMarkdown(parsed.content).trim(), source);
      assert.equal(md.getMarkdownWithPositions(parsed.content).markdown.trim(), source);
    }
    const lineBreak = String.fromCharCode(10);
    const codeSource = [fence + 'TypeScript', 'const x = 1;', fence].join(lineBreak);
    for (const source of [codeSource, '$x^2$', ['$$', 'x^2', '$$'].join(lineBreak)]) {
      const parsed = md.importFromMarkdownWithPositions(source);
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
      !/(?:editor-diagram|editor-custom-block|editor-html|editor-source-view|editor-code-block|editor-math|editor-emoji|editor-extensions\/|chat-ui|node_modules\/(?:mermaid|abcjs|plantuml-encoder|@babel\/standalone|@emoji-mart\/|codemirror|react-codemirror2|shiki|katex|rehype-katex))/.test(
        input
      ),
      `内核入口可达模块包含扩展实现：${input}`
    );
  console.log(`内核入口可达图：${inputs.length} 个模块，无已迁实现及已收口重依赖；待迁移依赖另列`);
  console.log("此检查忽略 CSS/less，不代表四端生产分块、样式/字体资源或首屏加载成本");
}
console.log("扩展 API、运行时依赖方向与四端 Node/headless codec 组合检查通过");
