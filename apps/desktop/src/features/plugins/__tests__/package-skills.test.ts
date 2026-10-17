import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

it.each([false, true])(
  "真实包加载链路注册 Skill，页面与 AI 可读，停用回收（editor=%s）",
  async editor => {
    const { definePlugin } = await import("@tau/plugins");
    const { PluginHost, createMemoryStorage } = await import("@tau/plugins/host");
    const { evaluatePluginPackage } = await import("@tau/plugins/rendering");
    const { registerPluginPackage } = await import("@/app/plugins/package-loader");
    const { registerPluginSkill } = await import("@/app/plugins/skill-registry");
    const { default: useSkillStore } = await import("@/stores/useSkillStore");
    const { skillToolsProvider } = await import("@/mcp/providers/skill-tools");
    const { toSkillItems } = await import("@/features/skills/useSkills");
    const modules = { "@tau/plugins": { definePlugin } };
    const artifact = {
      manifest: {
        formatVersion: 1 as const,
        apiVersion: 1 as const,
        platform: "desktop" as const,
        format: "cjs" as const,
        id: "test.package-skills",
        name: "包技能",
        version: "1.0.0",
        main: "main.js",
        integrity: { "main.js": "a".repeat(64) },
        ...(editor ? { editor: true as const } : {}),
      },
      code: `module.exports.default=require('@tau/plugins').definePlugin({
      id:'test.package-skills',name:'包技能',version:'1.0.0',
      ${editor ? "editorExtensions:[{id:'test.package-skills',apiVersion:1,elements:[{type:'test.node',kind:'block',render:()=>null}]}]," : ""}
      skills:[{id:'guide',name:'插件指南',description:'编写时使用',content:'# 包内技能正文'}]
    });`,
    };
    if (editor) {
      const { addContentPlugin } = await import("@/app/plugins/content-plugin-state");
      addContentPlugin(artifact, evaluatePluginPackage(artifact, modules));
    }
    const host = new PluginHost({
      workspaceId: "test",
      storage: createMemoryStorage(),
      skills: { register: registerPluginSkill },
    });
    const id = "test.package-skills:guide";
    useSkillStore.setState({ loaded: true });
    try {
      registerPluginPackage(host, artifact, async () => modules);
      expect(useSkillStore.getState().getSkillByFolderName(id)).toBeUndefined();
      await host.enable(artifact.manifest.id);
      const skill = useSkillStore.getState().getSkillByFolderName(id);
      expect(skill).toMatchObject({
        source: "plugin",
        pluginName: "包技能",
        readmeContent: "# 包内技能正文",
      });
      expect(toSkillItems([skill!], {}, {})[0]).toMatchObject({
        source: "plugin",
        enabled: true,
        readonly: true,
      });
      const read = skillToolsProvider.tools().find(tool => tool.name === "get_skill_readme")!;
      const result = await read.executor({ folderName: id });
      if (!result || typeof result === "string") throw new Error("未返回 Skill 内容");
      expect(JSON.parse(result.content)).toMatchObject({
        success: true,
        content: "# 包内技能正文",
      });
      await host.disable(artifact.manifest.id);
      expect(useSkillStore.getState().getSkillByFolderName(id)).toBeUndefined();
      await host.enable(artifact.manifest.id);
      expect(useSkillStore.getState().getSkillByFolderName(id)).toBeDefined();
    } finally {
      await host.dispose();
    }
    expect(useSkillStore.getState().getSkillByFolderName(id)).toBeUndefined();
  }
);
