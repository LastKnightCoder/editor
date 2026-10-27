import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/commands/plugin-local", () => ({
  setLocalPluginEnabled: vi.fn(async () => undefined),
}));
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

it("白板独立贡献进入同一内容目录，启停不影响无关博客发布", async () => {
  const state = await import("@/app/plugins/content-plugin-state");
  const { definePlugin } = await import("@tau/plugins");
  const { desktopContentPlugins } = await import("../../../../shared/content-plugins");
  const definition = definePlugin({
    id: "test.board",
    name: "白板",
    version: "1.0.0",
    whiteboardExtensions: [
      {
        id: "test.board",
        apiVersion: 1,
        elements: [{ dataVersion: 1, type: "test.board.box", render: () => null }],
        create: () => ({}),
      },
    ],
  });
  state.addContentPlugin(
    {
      code: "unused",
      manifest: {
        id: definition.id,
        name: definition.name,
        version: definition.version,
        formatVersion: 3,
        apiVersion: 1,
        platform: "portable" as const,
        format: "cjs",
        main: "main.js",

        integrity: { "main.js": "a".repeat(64) },

        profile: "web-v1" as const,
        targets: { desktop: { minAppVersion: "0.0.0" } },
      },
    },
    definition
  );
  expect(desktopContentPlugins.whiteboardExtensions).toHaveLength(1);
  expect(state.contentPluginLoaded(definition.id)).toBe(true);
  localStorage.setItem(state.localPluginStateKey(definition.id), "false");
  expect(state.getContentPluginPublishContext().plugins).toEqual([]);
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
      formatVersion: 3 as const,
      apiVersion: 1 as const,
      platform: "portable" as const,
      format: "cjs" as const,

      main: "main.js",
      integrity: { "main.js": "a".repeat(64) },

      profile: "web-v1" as const,
      targets: { desktop: { minAppVersion: "0.0.0" } },
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
        elements: [{ dataVersion: 1, type: "test.node", kind: "block", render: () => null }],
      },
    ],
  });
  state.initializeContentPluginState(["paragraph"]);
  state.addContentPlugin(artifact, definition);
  localStorage.setItem(state.localPluginStateKey("test.editor"), "true");
  const host = new PluginHost({ workspaceId: "test", storage: createMemoryStorage() });
  let enabled = true;
  const manager = new LocalPluginManager(
    host,
    [],
    async () => ({
      directory: "/test",
      entries: [{ id: "test.editor", directory: "/test/test.editor", artifact, enabled }],
    }),
    async () => ({}),
    localStorage,
    () => undefined,
    async () => undefined,
    async (_id, value) => {
      enabled = value;
    }
  );
  try {
    await manager.refresh();
    expect(host.getState("test.editor")).toBe("active");
    await manager.disable("test.editor");
    expect(manager.enabled("test.editor")).toBe(false);
    expect(host.getState("test.editor")).toBe("active");
    expect(manager.error("test.editor")).toContain("重启");
    await manager.restore();
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
