import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "packages/plugins/package.json"));
const ts = require("typescript");
const mainDirectory = path.join(root, "apps/desktop/src-electron/main");
const failures = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") await scan(filename);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const text = await readFile(filename, "utf8");
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
    const report = (node, message) =>
      failures.push(
        `${path.relative(root, filename)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${message}`
      );
    const evaluators = new Set(["evaluatePluginPackage", "acceptHeadlessPlugin"]);
    const registries = new Set(["desktopContentPlugins"]);
    const visit = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        if (!clause?.isTypeOnly && /(?:^|\/)scripts\//.test(node.moduleSpecifier.text))
          report(node, "运行时不能导入验收夹具");
        if (
          clause &&
          !clause.isTypeOnly &&
          clause.namedBindings &&
          ts.isNamedImports(clause.namedBindings)
        ) {
          for (const item of clause.namedBindings.elements) {
            if (item.isTypeOnly) continue;
            const imported = item.propertyName?.text ?? item.name.text;
            if (imported === "evaluatePluginPackage") evaluators.add(item.name.text);
            if (imported === "desktopContentPlugins") registries.add(item.name.text);
            if (["PluginHost", "ContentPluginRegistry"].includes(imported))
              report(item, "插件运行时或内容定义注册表不能在主进程创建");
          }
        }
      }
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (ts.isIdentifier(expression) && evaluators.has(expression.text))
          report(node, "插件求值必须在声明的后台进程或内容渲染进程");
        if (
          ts.isPropertyAccessExpression(expression) &&
          (evaluators.has(expression.name.text) ||
            (ts.isIdentifier(expression.expression) &&
              registries.has(expression.expression.text) &&
              ["load", "install"].includes(expression.name.text)))
        )
          report(node, "主进程/Node worker 不得装配插件定义");
      }
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "Function" &&
        path.relative(mainDirectory, filename) !== path.join("workers", "plugin-backend.worker.ts")
      )
        report(node, "插件动态代码执行只允许在独立后台 bootstrap");
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}
await scan(mainDirectory);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else console.log("插件进程边界检查通过：主进程和 Node worker 未装配插件定义");
