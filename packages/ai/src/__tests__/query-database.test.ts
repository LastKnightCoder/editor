import { expect, it } from "vitest";
import { QUERY_DATABASE_REFERENCE, buildQueryDatabaseMessages } from "../query-database";
import { INTERNAL_SKILLS } from "../skills/internal";
import { AiSkillRegistry } from "../skills";
import { verifyQueryExamples } from "../../../shared/src/query-database/__tests__/documentation-helpers";

it("面板每次带完整语法与动态定义，附加的结果行和正文不会进入模型上下文", () => {
  // 面板曾仅注入手写语法骨架，缺少完整约定且无法自行加载 Skill。
  const definition = {
    version: 1 as const,
    language: "javascript" as const,
    code: "return currentDefinition;",
    params: { tag: "读书", projectId: 42 },
    resultRows: [{ title: "private-row-not-for-model" }],
    content: "private-document-not-for-model",
  };
  const request = "保持原字段，统计文档数量";
  const error = "输入字段缺少定义";
  const messages = buildQueryDatabaseMessages({ definition, request, error });
  const rules = messages
    .filter(message => message.role === "system")
    .map(message => message.content)
    .join("\n");
  const context = messages
    .filter(message => message.role === "user")
    .map(message => message.content)
    .join("\n");
  expect(rules).toContain(QUERY_DATABASE_REFERENCE);
  for (const value of [
    definition.language,
    definition.code,
    JSON.stringify(definition.params),
    request,
    error,
  ])
    expect(context).toContain(value);
  const sent = JSON.stringify(messages);
  expect(sent).not.toContain(definition.resultRows[0].title);
  expect(sent).not.toContain(definition.content);
});

it("内置查询技能可按需加载同一参考，模型看到的完整示例可实际执行", async () => {
  const registry = new AiSkillRegistry();
  registry.registerSource({
    id: "internal",
    revision: "test",
    list: async () =>
      INTERNAL_SKILLS.map(skill => ({
        id: skill.folderName,
        path: `${skill.folderName}/SKILL.md`,
      })),
    read: async path => {
      const skill = INTERNAL_SKILLS.find(skill => path === `${skill.folderName}/SKILL.md`);
      if (!skill) throw new Error("技能不存在");
      return [
        "---",
        `name: ${JSON.stringify(skill.name)}`,
        `description: ${JSON.stringify(skill.description)}`,
        "---",
        skill.readmeContent,
      ].join("\n");
    },
  });
  const snapshot = await registry.captureAvailable();
  const loaded = await snapshot.load("internal:query-database");
  expect(loaded.instructions).toContain(QUERY_DATABASE_REFERENCE);
  expect(await verifyQueryExamples(loaded.instructions)).toEqual([]);
});
