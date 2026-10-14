import { afterEach, describe, expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { createMemoryStorage, PluginHost, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { registerDevelopmentPlugin } from "@/app/plugins/development-loader";

const hosts: PluginHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
});
function setup(
  source = "context.commands.register({id:'run',title:'执行',run:()=>42});",
  id = "example.external"
) {
  const host = new PluginHost({ workspaceId: "A", storage: createMemoryStorage() });
  hosts.push(host);
  const artifact: DevelopmentPluginPackage = {
    manifest: {
      formatVersion: 1,
      apiVersion: 1,
      platform: "desktop",
      format: "cjs",
      id,
      name: id,
      version: "1.0.0",
      main: "main.js",
      styles: "main.css",
      integrity: { "main.js": "a".repeat(64), "main.css": "b".repeat(64) },
    },
    code: `module.exports.default=require('@tau/plugins').definePlugin({id:${JSON.stringify(id)},name:${JSON.stringify(id)},version:'1.0.0',create:()=>({activate(context){${source}}})});`,
    css: ".example-external::before {content: 'test'}",
  };
  return { host, artifact };
}

describe("外部开发包延迟加载", () => {
  it("只登记元信息，启用才加载；重复 ID 在执行前拒绝，停用清理且可重启用", async () => {
    const { host, artifact } = setup();
    const modules = vi.fn(async () => ({ "@tau/plugins": { definePlugin } }));
    registerDevelopmentPlugin(host, artifact, modules);
    expect(host.listPlugins()[0].state).toBe("disabled");
    expect(modules).not.toHaveBeenCalled();
    expect(() => registerDevelopmentPlugin(host, artifact, modules)).toThrow("已注册");
    await host.enable(artifact.manifest.id);
    expect(await host.executeCommand("example.external:run")).toBe(42);
    expect(document.querySelectorAll("style[data-tau-plugin]")).toHaveLength(1);
    await host.disable(artifact.manifest.id);
    expect(document.querySelectorAll("style[data-tau-plugin]")).toHaveLength(0);
    expect(host.listCommands()).toHaveLength(0);
    await host.enable(artifact.manifest.id);
    expect(modules).toHaveBeenCalledTimes(2);
    expect(host.listCommands()).toHaveLength(1);
  });

  it.each([
    ["module.exports.default={id:'wrong'}", "清单不一致"],
    ["require('node:fs')", "未提供"],
    ["throw new Error('入口失败')", "入口失败"],
  ])("加载错误保留可管理的失败状态：%s", async (code, error) => {
    const { host, artifact } = setup();
    registerDevelopmentPlugin(host, { ...artifact, code }, async () => ({}));
    await expect(host.enable(artifact.manifest.id)).rejects.toThrow(error);
    expect(host.getState(artifact.manifest.id)).toBe("failed");
    expect(document.querySelectorAll("style[data-tau-plugin]")).toHaveLength(0);
  });

  it("激活半途失败回收命令与 CSS", async () => {
    const { host, artifact } = setup(
      "context.commands.register({id:'run',title:'执行',run:()=>null});throw new Error('激活失败');"
    );
    registerDevelopmentPlugin(host, artifact, async () => ({ "@tau/plugins": { definePlugin } }));
    await expect(host.enable(artifact.manifest.id)).rejects.toThrow("激活失败");
    expect(host.listCommands()).toHaveLength(0);
    expect(document.querySelectorAll("style[data-tau-plugin]")).toHaveLength(0);
  });

  it("加载宿主模块期间停用，不执行入口", async () => {
    const { host, artifact } = setup();
    let release!: (value: Record<string, unknown>) => void;
    const modules = new Promise<Record<string, unknown>>(resolve => {
      release = resolve;
    });
    registerDevelopmentPlugin(host, artifact, () => modules);
    const enabled = host.enable(artifact.manifest.id);
    const rejected = expect(enabled).rejects.toThrow();
    await Promise.resolve();
    const stopped = host.disable(artifact.manifest.id);
    release({});
    await rejected;
    await stopped;
    expect(host.getState(artifact.manifest.id)).toBe("disabled");
    expect(document.querySelectorAll("style[data-tau-plugin]")).toHaveLength(0);
  });
});
