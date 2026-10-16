import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/commands/plugin-local", () => ({
  setEditorPluginEnabled: vi.fn(async () => undefined),
}));
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

it("编辑器插件启停只改变下次启动意图，不卸载当前渲染快照", async () => {
  const state = await import("@/app/plugins/content-plugin-state");
  const { definePlugin } = await import("@tau/plugins");
  const { PluginHost, createMemoryStorage } = await import("@tau/plugins/host");
  const { LocalPluginManager } = await import("@/app/plugins/local-manager");
  const artifact = {
    manifest: {
      id: "test.editor",
      name: "test",
      version: "1.0.0",
      formatVersion: 1 as const,
      apiVersion: 1 as const,
      platform: "desktop" as const,
      format: "cjs" as const,
      editor: true as const,
      main: "main.js",
      integrity: { "main.js": "a".repeat(64) },
    },
    code: "unused",
  };
  const definition = definePlugin({
    id: "test.editor",
    name: "test",
    version: "1.0.0",
    editorExtensions: [
      {
        id: "test.ext",
        apiVersion: 1,
        elements: [{ type: "test.node", kind: "block", render: () => null }],
      },
    ],
  });
  state.initializeContentPluginState(["paragraph"]);
  state.addContentPlugin(artifact, definition);
  localStorage.setItem(state.localPluginStateKey("test.editor"), "true");
  const host = new PluginHost({ workspaceId: "test", storage: createMemoryStorage() });
  const manager = new LocalPluginManager(
    host,
    [],
    async () => ({
      directory: "/test",
      entries: [{ id: "test.editor", directory: "/test/test.editor", artifact }],
    }),
    async () => ({}),
    localStorage,
    () => undefined,
    async () => undefined
  );
  try {
    await manager.refresh();
    expect(host.getState("test.editor")).toBe("active");
    await manager.disable("test.editor");
    expect(manager.enabled("test.editor")).toBe(false);
    expect(host.getState("test.editor")).toBe("active");
    expect(manager.error("test.editor")).toContain("重启");
    await manager.restore(null);
    expect(host.getState("test.editor")).toBe("active");
    expect(() => state.getContentPluginPublishContext()).toThrow("重启");
    await expect(manager.uninstall("test.editor", false)).rejects.toThrow("重启");
    await manager.enable("test.editor");
    expect(state.getContentPluginPublishContext().plugins[0].nodeTypes).toEqual(["test.node"]);
  } finally {
    manager.cancel();
    await host.dispose();
  }
});
