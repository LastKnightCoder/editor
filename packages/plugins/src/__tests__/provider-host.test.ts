import { expect, it } from "vitest";
import { PluginHost, createMemoryStorage } from "../host";
import { definePlugin } from "../index";
import { RendererSyncRegistry } from "../provider-host";

it.each(["desktop", "android", "ios"] as const)(
  "%s 使用同一提供方接口，配置固定且注销后迟到数据不交付",
  async platform => {
    const registry = new RendererSyncRegistry();
    let finish!: (bytes: Uint8Array) => void;
    let received: unknown;
    const host = new PluginHost({
      workspaceId: "fixture",
      environment: {
        platform,
        input: { coarsePointer: platform !== "desktop", finePointer: platform === "desktop" },
      },
      storage: createMemoryStorage(),
      sync: registry,
    });
    host.registerTrusted(
      definePlugin({
        id: "fixture.sync",
        name: "fixture",
        version: "1.0.0",
        create: () => ({
          activate(context) {
            context.sync.register({
              id: context.pluginId,
              name: "fixture",
              create(config) {
                received = config;
                return {
                  uploadFile: async () => true,
                  createFileIfAbsent: async () => false,
                  fileExists: async () => true,
                  listFiles: async () => [],
                  downloadFile: async () =>
                    new Promise(resolve => {
                      finish = resolve;
                    }),
                };
              },
            });
          },
        }),
      })
    );
    await host.enable("fixture.sync");
    const config = { prefix: "old" };
    await registry.execute({ kind: "open", session: "job", pluginId: "fixture.sync", config });
    config.prefix = "new";
    expect(received).toEqual({ prefix: "old" });
    expect(
      await registry.execute({
        kind: "call",
        session: "job",
        method: "createFileIfAbsent",
        args: ["head", new Uint8Array([1])],
      })
    ).toBe(false);
    const pending = registry.execute({
      kind: "call",
      session: "job",
      method: "downloadFile",
      args: ["database"],
    });
    const assertion = expect(pending).rejects.toThrow("停用");
    const disabled = host.disable("fixture.sync");
    finish(new Uint8Array([1]));
    await assertion;
    await disabled;
    expect(registry.list()).toHaveLength(0);
    await host.dispose();
  }
);
it("未启用提供方不能创建任务", async () => {
  const registry = new RendererSyncRegistry();
  await expect(
    registry.execute({ kind: "open", session: "job", pluginId: "missing", config: {} })
  ).rejects.toThrow("未在当前窗口启用");
});
