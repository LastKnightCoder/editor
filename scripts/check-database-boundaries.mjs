import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "packages/database");
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
assert.deepEqual(Object.keys(manifest.exports), ["."], "Database 仅公开根入口");
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
      assert(!/components\/Database(?:\/|$)/.test(specifier), "旧 Database 路径不得回流：" + label);
      const local = specifier.startsWith(".") ? resolve(dirname(file), specifier) : undefined;
      if (!inside(file, packageRoot)) {
        assert(
          !specifier.startsWith("@tau/database/") && !(local && inside(local, packageRoot)),
          "消费者使用 @tau/database 根入口：" + label
        );
      }
      if (!inPackage) return;
      assert(
        !specifier.startsWith("@/") && !(local && !inside(local, packageRoot)),
        "Database 不得引用宿主或包外私有实现：" + label
      );
      assert(
        !/^(electron(?:-.*)?|node:|better-sqlite3|slate(?:-.*)?|@tau\/editor(?:$|-|\/)|@tau\/platform(?:$|\/))/.test(
          specifier
        ),
        "Database 不得依赖桌面、编辑器或原生能力：" + label
      );
      if (specifier.startsWith("@tau/shared")) {
        assert(
          specifier === "@tau/shared/calendar-utils" ||
            (specifier === "@tau/shared/database-types" && typeOnly),
          "shared 仅允许日历纯函数与 type-only 模型：" + label
        );
      }
      if (!local) {
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
            "tableId",
            "databaseName",
            "detailContentId",
            "refCount",
            "DataTable",
            "DataTableView",
            "CreateDataTableView",
            "UpdateDataTableView",
            "DatabaseHookResult",
          ].includes(node.text),
          "Database 不感知持久化实体字段：" + relative(root, file) + ": " + node.text
        );
      }
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const clause = node.importClause;
        if (inPackage && clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const item of clause.namedBindings.elements) {
            assert(
              ![
                "DataTable",
                "DataTableView",
                "CreateDataTableView",
                "UpdateDataTableView",
                "DatabaseHookResult",
              ].includes((item.propertyName ?? item.name).text),
              "Database 不消费持久化模型：" + relative(root, file)
            );
          }
        }
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
console.log("Database 边界通过：无宿主依赖、无私有深引、共享模型仅类型导入、直接依赖已声明");
