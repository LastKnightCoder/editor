import { beforeEach, expect, it, vi } from "vitest";
import type { Skill } from "@/types";

const listed = vi.hoisted(() => ({ skills: [] as Skill[] }));
vi.mock("@/commands/skill", () => ({
  listSkills: vi.fn(async () => listed.skills),
  getSkillReadme: vi.fn(async () => "# 插件指南"),
  getSkillTree: vi.fn(),
  readSkillFile: vi.fn(),
  runSkillScript: vi.fn(),
  cancelSkillScript: vi.fn(),
  createSkill: vi.fn(),
  deleteSkill: vi.fn(),
}));

const pluginSkill: Skill = {
  folderName: "test.writer:guide",
  name: "写作指南",
  description: "写作时使用",
  path: "/plugins/test.writer/skills/guide",
  source: "plugin",
  pluginId: "test.writer",
  pluginName: "写作",
};
const packageSkill: Skill = {
  folderName: "test.pack:style",
  name: "风格",
  description: "统一风格",
  path: "/plugins/test.pack/skills/style",
  source: "package",
  pluginId: "test.pack",
  pluginName: "风格包",
};

beforeEach(() => {
  vi.resetModules();
  listed.skills = [pluginSkill, packageSkill];
});

const load = async () => {
  const registry = await import("@/app/plugins/skill-registry");
  const { default: useSkillStore } = await import("@/stores/useSkillStore");
  await useSkillStore.getState().loadSkills();
  return { registry, useSkillStore };
};

it("插件 Skill 随插件启停显示，Skill 包安装即可用", async () => {
  const active = new Set<string>();
  const { registry, useSkillStore } = await load();
  registry.setPluginSkillGate(id => active.has(id));
  const names = () => useSkillStore.getState().skills.map(skill => skill.folderName);
  expect(names()).toContain("test.pack:style");
  expect(names()).not.toContain("test.writer:guide");
  active.add("test.writer");
  registry.notifyPluginSkillGateChanged();
  expect(names()).toContain("test.writer:guide");
  active.delete("test.writer");
  registry.notifyPluginSkillGateChanged();
  expect(names()).not.toContain("test.writer:guide");
});

it("插件包变化后重新列出 Skill", async () => {
  const { registry, useSkillStore } = await load();
  registry.setPluginSkillGate(() => true);
  listed.skills = [pluginSkill];
  registry.notifyPluginPackagesChanged();
  await vi.waitFor(() =>
    expect(useSkillStore.getState().getSkillByFolderName("test.pack:style")).toBeUndefined()
  );
  expect(useSkillStore.getState().getSkillByFolderName("test.writer:guide")).toBeDefined();
});

it("插件 Skill 按磁盘目录读取，点名时注入 SKILL.md 正文", async () => {
  const { registry, useSkillStore } = await load();
  registry.setPluginSkillGate(() => true);
  const { skillToolsProvider } = await import("@/mcp/providers/skill-tools");
  const read = skillToolsProvider.tools().find(tool => tool.name === "get_skill_readme")!;
  const result = await read.executor({ folderName: "test.writer:guide" });
  if (!result || typeof result === "string") throw new Error("未返回结构化结果");
  expect(JSON.parse(result.content)).toMatchObject({ success: true, content: "# 插件指南" });

  const { withForcedSkillReadmes } = await import("@/services/piChatSession");
  const skills = await withForcedSkillReadmes(useSkillStore.getState().skills, [
    "test.writer:guide",
  ]);
  expect(skills.find(skill => skill.folderName === "test.writer:guide")?.readmeContent).toBe(
    "# 插件指南"
  );
  expect(skills.find(skill => skill.folderName === "test.pack:style")?.readmeContent).toBe(
    undefined
  );
});
