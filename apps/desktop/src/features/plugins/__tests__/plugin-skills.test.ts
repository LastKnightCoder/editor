import { expect, it } from "vitest";
import { registerPluginSkill } from "@/app/plugins/skill-registry";
import useSkillStore, { isSkillEnabled, getSkillInvocation } from "@/stores/useSkillStore";
import { toSkillItems } from "@/features/skills/useSkills";
import { skillToolsProvider } from "@/mcp/providers/skill-tools";

it("技能有插件来源、命名空间和正文，模式偏好保留，卸载从 AI 与页面共享列表移除", () => {
  const definition = { id: "authoring", name: "示例", description: "编写示例", content: "# SKILL" };
  const first = registerPluginSkill({ id: "test.one", name: "插件一" }, definition);
  const second = registerPluginSkill({ id: "test.two", name: "插件二" }, definition);
  try {
    const store = useSkillStore.getState();
    const skill = store.getSkillByFolderName("test.one:authoring")!;
    expect(skill.readmeContent).toBe("# SKILL");
    expect(skill.pluginName).toBe("插件一");
    expect(toSkillItems([skill], {}, {})[0]).toMatchObject({ source: "plugin", readonly: true });
    store.setInvocation(skill.folderName, "manual");
    expect(getSkillInvocation(skill, useSkillStore.getState().preferences)).toBe("manual");
    store.setEnabled(skill.folderName, false);
    expect(isSkillEnabled(skill, useSkillStore.getState().preferences)).toBe(false);
    first.dispose();
    expect(store.getSkillByFolderName(skill.folderName)).toBeUndefined();
    expect(store.getSkillByFolderName("test.two:authoring")).toBeDefined();
  } finally {
    first.dispose();
    second.dispose();
  }
});

it("AI 工具能读取插件正文，停用后不可再次加载", async () => {
  useSkillStore.setState({ loaded: true });
  const registration = registerPluginSkill(
    { id: "test.reader", name: "阅读器" },
    {
      id: "guide",
      name: "指南",
      description: "编写时使用",
      content: "# 插件指南",
    }
  );
  const read = skillToolsProvider.tools().find(tool => tool.name === "read_skill_file")!;
  const input = { folderName: "test.reader:guide", relativePath: "SKILL.md" };
  const readResult = async () => {
    const result = await read.executor(input);
    if (!result || typeof result === "string") throw new Error("技能工具未返回结构化结果");
    return JSON.parse(result.content);
  };
  try {
    expect(await readResult()).toMatchObject({
      success: true,
      content: "# 插件指南",
    });
    useSkillStore.getState().setEnabled(input.folderName, false);
    expect((await readResult()).success).toBe(false);
  } finally {
    registration.dispose();
  }
});
