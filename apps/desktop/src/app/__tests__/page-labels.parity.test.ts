import ts from "@typescript/typescript6";
import { expect, it } from "vitest";
import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { appMessages } from "../i18n/messages";

const pages = import.meta.glob<string>("../../features/**/pages/*.page.tsx", {
  eager: true,
  query: "?raw",
  import: "default",
});

it("页面声明扫描非空", () => {
  expect(Object.keys(pages).length).toBeGreaterThan(0);
});

// 插件页曾将功能词典的引用交给标题栏的应用词典，打开页面即触发整窗错误。
it.each(Object.entries(pages))("%s 的默认标题可由宿主词典解析", (path, source) => {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const owners = new Set<string>();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@/app/i18n/messages"
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const binding of bindings.elements)
        if ((binding.propertyName ?? binding.name).text === "appMessages")
          owners.add(binding.name.text);
  }

  const labels: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "definePage"
    ) {
      const declaration = node.arguments[0];
      if (!declaration || !ts.isObjectLiteralExpression(declaration))
        throw new Error(`${path} 的页面声明缺少配置对象`);
      const label = declaration.properties.find(
        property => ts.isPropertyAssignment(property) && property.name.getText(file) === "label"
      );
      if (!label || !ts.isPropertyAssignment(label)) throw new Error(`${path} 缺少默认标题`);
      labels.push(label.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  expect(labels.length).toBeGreaterThan(0);

  for (const label of labels) {
    if (ts.isStringLiteralLike(label)) continue;
    if (
      !ts.isCallExpression(label) ||
      !ts.isPropertyAccessExpression(label.expression) ||
      !ts.isIdentifier(label.expression.expression) ||
      label.expression.name.text !== "ref"
    )
      throw new Error(`${path} 的默认标题必须是字面字符串或应用词典引用`);
    const key = label.arguments[0];
    if (!key || !ts.isStringLiteralLike(key)) throw new Error(`${path} 的默认标题缺少文案键`);

    for (const locale of ["zh-CN", "zh-TW", "en-US"]) {
      const runtime = createI18nRuntime({ localeSource: createLocaleStore(locale) });
      try {
        expect(() =>
          runtime.get(appMessages).resolve({ kind: "i18n", key: key.text })
        ).not.toThrow();
      } finally {
        runtime.dispose();
      }
    }
    expect(owners.has(label.expression.expression.text)).toBe(true);
  }
});
