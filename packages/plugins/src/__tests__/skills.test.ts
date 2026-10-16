import { expect, it } from "vitest";
import { definePlugin } from "../index";
import { PluginHost, createMemoryStorage } from "../host";

it("插件 Skill 随启停、激活失败回收，重复启用不重复注册", async () => {
  const active = new Set<string>();
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    skills: {
      register(pluginId, skill) {
        const id = `${pluginId}:${skill.id}`;
        expect(active.has(id)).toBe(false);
        active.add(id);
        return {
          dispose() {
            active.delete(id);
          },
        };
      },
    },
  });
  const definition = definePlugin({
    id: "test.skills",
    name: "测试",
    version: "1.0.0",
    skills: [{ id: "write", name: "写作", description: "写作时使用", content: "# 写作" }],
  });
  host.registerTrusted(definition);
  await host.enable(definition.id);
  await host.enable(definition.id);
  expect([...active]).toEqual(["test.skills:write"]);
  await host.disable(definition.id);
  expect(active.size).toBe(0);
  host.registerTrusted({
    ...definition,
    id: "test.failed",
    create: () => ({
      activate() {
        throw new Error("失败");
      },
    }),
  });
  await expect(host.enable("test.failed")).rejects.toThrow("失败");
  expect(active.size).toBe(0);
  await host.dispose();
});
