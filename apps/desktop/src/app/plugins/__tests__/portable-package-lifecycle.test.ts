import { expect, it, vi } from "vitest";
import { definePlugin } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { buildPortablePluginManifest } from "@tau/plugins/portable";
import { registerPluginPackage } from "../package-loader";
import { contentPluginDiscovered } from "../content-plugin-state";

function fixture(id: string, content: boolean) {
  const manifest = buildPortablePluginManifest(
    { id, name: "生命周期", version: "1.0.0", targets: { desktop: { minAppVersion: "0.59.4" } } },
    { main: "main.js", integrity: { "main.js": "a".repeat(64) } }
  );
  const code = `const sdk=require('@tau/plugins');module.exports.default=sdk.definePlugin({id:${JSON.stringify(id)},name:'生命周期',version:'1.0.0',${content ? "editorExtensions:[{id:'fixture.extension',apiVersion:1,elements:[{type:'fixture.node',kind:'block',render:()=>null}]}]," : ""}create:sdk.instance});`;
  const activate = vi.fn();
  const instance = vi.fn(() => ({ activate }));
  return {
    artifact: { manifest, code },
    activate,
    instance,
    modules: { "@tau/plugins": { definePlugin, instance } },
  };
}

it("普通格式 3 插件无需静态贡献标记即可直接启停，登记时不求值或激活", async () => {
  const value = fixture("fixture.ordinary-lifecycle", false);
  const host = new PluginHost({ workspaceId: "lifecycle", storage: createMemoryStorage() });
  const modules = vi.fn(async () => value.modules);
  try {
    registerPluginPackage(host, value.artifact, modules);
    expect(modules).not.toHaveBeenCalled();
    await host.enable(value.artifact.manifest.id);
    expect(value.activate).toHaveBeenCalledOnce();
    expect(contentPluginDiscovered(value.artifact)).toBe(false);
    await host.disable(value.artifact.manifest.id);
    expect(host.getState(value.artifact.manifest.id)).toBe("disabled");
  } finally {
    await host.dispose();
  }
});

it("首次启用从实际定义识别正文贡献并要求重启，不创建或激活内容实例", async () => {
  const value = fixture("fixture.static-lifecycle", true);
  const host = new PluginHost({ workspaceId: "lifecycle", storage: createMemoryStorage() });
  try {
    registerPluginPackage(host, value.artifact, async () => value.modules);
    await expect(host.enable(value.artifact.manifest.id)).rejects.toThrow("重启");
    expect(value.instance).not.toHaveBeenCalled();
    expect(contentPluginDiscovered(value.artifact)).toBe(true);
    const updated = {
      ...value.artifact,
      manifest: { ...value.artifact.manifest, version: "1.0.1" },
    };
    expect(contentPluginDiscovered(updated)).toBe(false);
  } finally {
    await host.dispose();
  }
});
