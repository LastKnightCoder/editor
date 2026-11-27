import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AiSkillRegistry, type AiSkillSource } from "../index";
import { INTERNAL_SKILLS } from "../internal";
import { buildUserDocsSkillArtifacts } from "../../../../../scripts/build-user-docs-skill.mjs";

const internalSource: AiSkillSource = {
  id: "internal",
  revision: "1",
  list: async () =>
    INTERNAL_SKILLS.map(skill => ({ id: skill.folderName, path: `${skill.folderName}/SKILL.md` })),
  read: async path => {
    const slash = path.indexOf("/");
    const folderName = path.slice(0, slash);
    const relativePath = path.slice(slash + 1);
    const skill = INTERNAL_SKILLS.find(item => item.folderName === folderName);
    if (!skill) throw new Error(`missing skill: ${folderName}`);
    if (relativePath === "SKILL.md") {
      return [
        "---",
        `name: ${JSON.stringify(skill.name)}`,
        `description: ${JSON.stringify(skill.description)}`,
        "---",
        skill.readmeContent,
      ].join("\n");
    }
    const content = await skill.readResource?.(relativePath);
    if (content === undefined) throw new Error(`missing resource: ${relativePath}`);
    return content;
  },
};

describe("内置使用文档 Skill 与官网文档对账", () => {
  it("生成产物与 apps/website/content/docs 及 manifest 保持一致", () => {
    const { files, resourcePaths } = buildUserDocsSkillArtifacts();
    expect(resourcePaths.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file.path, "utf8")).toBe(file.content);
    }
  });

  it("可通过 AiSkillRegistry 加载目录并按需读取清洗后的文档正文", async () => {
    const registry = new AiSkillRegistry();
    registry.registerSource(internalSource);
    const snapshot = await registry.capture(["internal:tau-docs"]);
    const loaded = await snapshot.load("internal:tau-docs");
    expect(loaded.instructions).toContain("references/ai.md");
    expect(loaded.instructions).toContain("references/shortcuts.md");

    const aiDoc = await snapshot.readResource("internal:tau-docs", "references/ai.md");
    expect(aiDoc.startsWith("# AI 对话与洞见\n")).toBe(true);
    expect(aiDoc).not.toContain("::demo{");
    expect(aiDoc).toContain("](references/shortcuts.md#全局)");
    expect(aiDoc).not.toContain("](/docs/");
  });
});
