import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/skill", () => ({
  listSkills: vi.fn(async () => []),
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
  getSkillReadme: vi.fn(),
  getSkillTree: vi.fn(),
  readSkillFile: vi.fn(),
  runSkillScript: vi.fn(),
  cancelSkillScript: vi.fn(),
}));

import useSkillStore from "@/stores/useSkillStore";
import { skillToolsProvider } from "../skill-tools";

async function runTool(name: string, args: Record<string, unknown>) {
  const tool = skillToolsProvider.tools().find(item => item.name === name);
  if (!tool?.executor) throw new Error(`未找到工具：${name}`);
  const result = await tool.executor(args);
  if (result == null) throw new Error(`工具返回空结果：${name}`);
  const raw = typeof result === "string" ? result : result.content;
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("内置 Skill 附属参考资料读取", () => {
  beforeEach(async () => {
    useSkillStore.setState({ skills: [], loaded: false, preferences: {}, usage: {} });
    await useSkillStore.getState().loadSkills();
  });

  it("get_skill_tree 展示内置 tau-docs 的 references 目录，单文件内置 Skill 保持仅 SKILL.md", async () => {
    const docsTree = await runTool("get_skill_tree", { folderName: "tau-docs" });
    expect(docsTree.success).toBe(true);
    expect(docsTree.tree).toContain("tau-docs/ [只读]");
    expect(docsTree.tree).toContain("references/");
    expect(docsTree.tree).toContain("ai.md");

    const schemaTree = await runTool("get_skill_tree", { folderName: "database-schema" });
    expect(schemaTree).toEqual({
      success: true,
      tree: "database-schema/ [只读]\n└── SKILL.md",
    });
  });

  it("read_skill_file 可按相对路径读取内置 tau-docs 参考文档，并拒绝越界与不存在的路径", async () => {
    const aiResult = await runTool("read_skill_file", {
      folderName: "tau-docs",
      relativePath: "references/ai.md",
    });
    expect(aiResult.success).toBe(true);
    expect(aiResult.content).toContain("# AI 对话与洞见");

    const missing = await runTool("read_skill_file", {
      folderName: "tau-docs",
      relativePath: "references/missing.md",
    });
    expect(missing.success).toBe(false);

    const traversal = await runTool("read_skill_file", {
      folderName: "tau-docs",
      relativePath: "../secret.md",
    });
    expect(traversal.success).toBe(false);
  });
});
