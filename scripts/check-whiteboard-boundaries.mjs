import assert from "node:assert/strict";
import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "packages/whiteboard");
const ts = createRequire(resolve(packageRoot, "package.json"))("typescript");
const ignored = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "release",
  "output",
  "target",
  "gen",
  ".wxt",
  ".output",
]);
const files = directory =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
  });
const inside = (file, directory) => file.startsWith(directory + sep);
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
assert.deepEqual(
  Object.keys(manifest.exports),
  [".", "./extensions", "./author", "./styles.css"],
  "Whiteboard 仅公开画布、扩展、作者契约和样式入口"
);
const declared = new Set(
  Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.devDependencies,
  })
);

for (const directory of ["apps", "packages", "editor-extensions", "examples"]) {
  for (const file of files(resolve(root, directory))) {
    const inPackage = inside(file, resolve(packageRoot, "src"));
    const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const check = (specifier, typeOnly = false) => {
      const label = relative(root, file) + ": " + specifier;
      assert(
        !/components\/WhiteBoard(?:\/|$)/.test(specifier),
        "旧 Whiteboard 路径不得回流：" + label
      );
      const local = specifier.startsWith(".") ? resolve(dirname(file), specifier) : undefined;
      if (!inside(file, packageRoot)) {
        assert(
          (!specifier.startsWith("@tau/whiteboard/") ||
            [
              "@tau/whiteboard/extensions",
              "@tau/whiteboard/author",
              "@tau/whiteboard/styles.css",
            ].includes(specifier)) &&
            !(local && inside(local, packageRoot)),
          "消费者使用 @tau/whiteboard 公开入口：" + label
        );
      }
      if (!inPackage) return;
      const isTest = /(?:__tests__|\.test\.)/.test(file);
      assert(
        !specifier.startsWith("@/") && !(local && !inside(local, packageRoot)),
        "Whiteboard 不得引用宿主或包外私有实现：" + label
      );
      assert(
        !/^(electron(?:-.*)?|better-sqlite3|@tau\/platform(?:$|\/))/.test(specifier),
        "Whiteboard 不得依赖桌面或原生能力：" + label
      );
      assert(isTest || !specifier.startsWith("node:"), "生产代码不得依赖 Node：" + label);
      if (specifier.startsWith("@tau/shared")) {
        assert(
          specifier === "@tau/shared/color-utils" ||
            specifier === "@tau/shared/rich-text-text" ||
            specifier === "@tau/shared/service-contract" ||
            specifier === "@tau/shared/service-registry" ||
            specifier === "@tau/shared/host-services" ||
            specifier === "@tau/shared/media-services" ||
            (["@tau/shared/entity-ref", "@tau/shared/media-types"].includes(specifier) && typeOnly),
          "shared 仅允许公开纯工具、服务契约（标识/注册表/宿主服务）与 type-only 实体地址：" + label
        );
      }
      if (!local && !specifier.startsWith("node:")) {
        const name = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0];
        assert(declared.has(name), "未声明直接依赖：" + label);
      }
    };
    const visit = node => {
      if (inPackage && ts.isIdentifier(node)) {
        assert(
          ![
            "WhiteboardServices",
            "WhiteboardSlots",
            "WhiteboardHostContext",
            "useWhiteboardHost",
            "defaultWhiteboardServices",
          ].includes(node.text),
          "白板宿主协议不得回流：" + relative(root, file)
        );
      }
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const clause = node.importClause;
        const typeOnly =
          node.isTypeOnly ||
          clause?.isTypeOnly ||
          (clause?.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            !clause.name &&
            clause.namedBindings.elements.every(item => item.isTypeOnly));
        check(node.moduleSpecifier.text, typeOnly);
      }
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      )
        check(node.argument.literal.text, true);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(ast) === "require") &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        check(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
}

// 按转译后的运行时模块图检查，类型引用不视作加载领域实现。
const visited = new Set();
const inspectCore = (file, trail = []) => {
  if (visited.has(file)) return;
  visited.add(file);
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const inspectImport = specifier => {
    const chain = [...trail, relative(packageRoot, file), specifier].join(" → ");
    assert(
      !/^(slate(?:-react)?|@tau\/editor(?:$|[-/])|@tau\/markdown|@zumer\/snapdom)/.test(specifier),
      "画布核心不得加载文本或导出实现：" + chain
    );
    if (!specifier.startsWith(".")) return;
    const candidate = resolve(dirname(file), specifier);
    const target = [
      candidate,
      candidate + ".ts",
      candidate + ".tsx",
      resolve(candidate, "index.ts"),
      resolve(candidate, "index.tsx"),
    ].find(path => existsSync(path) && statSync(path).isFile());
    if (!target || !inside(target, packageRoot)) return;
    assert(!target.endsWith("extensions/builtins.tsx"), "核心不得反向加载扩展装配：" + chain);
    inspectCore(target, [...trail, relative(packageRoot, file)]);
  };
  const visit = node => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      inspectImport(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      inspectImport(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
};
inspectCore(resolve(packageRoot, "src/WhiteBoard.tsx"));
inspectCore(resolve(packageRoot, "src/Board.tsx"));
inspectCore(resolve(packageRoot, "src/index.ts"));

// 作者契约连同 type-only 依赖一起检查，不能通过声明文件重新暴露内核。
const authorGraph = ts.createProgram([resolve(packageRoot, "src/author.ts")], {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  allowImportingTsExtensions: true,
  noEmit: true,
});
const authorFiles = new Set([
  "author.ts",
  "authorSketch.ts",
  "components/SketchPaths/index.tsx",
  "utils/sketch/geometry.ts",
  "utils/sketch/random.ts",
  "utils/sketch/ink.ts",
  "utils/sketch/levels.ts",
  "utils/sketch/shape.ts",
  "utils/sketch/types.ts",
  "utils/sketch/handText.ts",
  "utils/dash.ts",
  "extensions/api.ts",
  "extensions/context.ts",
  "extensions/authorHooks.ts",
  "extensions/events.ts",
  "extensions/standard-schema.ts",
  "types/element.ts",
  "types/containment.ts",
  "types/operation.ts",
  "types/selection.ts",
  "types/viewport.ts",
  "types/path.ts",
  "types/point.ts",
  "types/presentation.ts",
  "types/sketch.ts",
  "types/schematic.ts",
]);
for (const source of authorGraph.getSourceFiles()) {
  const file = source.fileName;
  if (file.includes("/node_modules/")) continue;
  if (inside(file, packageRoot))
    assert(
      authorFiles.has(relative(resolve(packageRoot, "src"), file)),
      "白板作者声明依赖内部实现：" + file
    );
  assert(
    !inside(file, resolve(root, "packages/editor")),
    "白板作者契约不得引入编辑器实现：" + file
  );
}
console.log(
  "Whiteboard 边界通过：旧宿主协议清零、核心不加载文本与导出实现、无宿主依赖或私有深引、直接依赖已声明"
);
