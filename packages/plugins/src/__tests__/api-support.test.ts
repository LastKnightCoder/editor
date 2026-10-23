import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import { PLUGIN_CAPABILITIES } from "../capabilities";

it("作者支持矩阵覆盖所有 PluginContext 成员及已登记能力，新增 API 不可漏分类", () => {
  const document = readFileSync(new URL("../../docs/api-support.md", import.meta.url), "utf8");
  const contract = ts.createSourceFile(
    "contract.ts",
    readFileSync(new URL("../contract.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const context = contract.statements.find(
    statement => ts.isInterfaceDeclaration(statement) && statement.name.text === "PluginContext"
  );
  if (!context || !ts.isInterfaceDeclaration(context)) throw new Error("找不到 PluginContext 契约");
  for (const member of context.members) {
    if (!member.name || !ts.isIdentifier(member.name)) throw new Error("上下文成员需要显式名称");
    expect(document, `矩阵缺少 ${member.name.text}`).toContain(`context.${member.name.text}`);
  }
  for (const capability of PLUGIN_CAPABILITIES) expect(document).toContain(capability);
});
