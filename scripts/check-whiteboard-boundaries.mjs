import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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
assert.deepEqual(Object.keys(manifest.exports), [".", "./styles.css"], "Whiteboard 仅公开根入口");
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
            specifier === "@tau/whiteboard/styles.css") &&
            !(local && inside(local, packageRoot)),
          "消费者使用 @tau/whiteboard 根入口：" + label
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
            (["@tau/shared/entity-ref", "@tau/shared/media-types"].includes(specifier) && typeOnly),
          "shared 仅允许公开纯工具与 type-only 实体地址：" + label
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
console.log(
  "Whiteboard 边界通过：无宿主依赖、无私有深引、共享类型与纯工具仅经公开入口、直接依赖已声明"
);
