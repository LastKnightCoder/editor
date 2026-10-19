import { expect, it, vi } from "vitest";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { definePlugin } from "@tau/plugins";
import { RendererPublishRegistry } from "../publish-registry";

it("真实 PluginHost 注册并回收发布贡献，停用中止在途操作并拒绝旧回复", async () => {
  const registry = new RendererPublishRegistry();
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    publish: registry,
  });
  let signal!: AbortSignal, finish!: () => void;
  const dispose = vi.fn();
  host.registerTrusted(
    definePlugin({
      id: "test.publisher",
      name: "发布器",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.publish.register({
            id: context.pluginId,
            name: "发布器",
            create: () => ({
              mode: "files",
              concurrency: 1,
              describe: async () => ({ identity: "test", basePath: "/" }),
              checkConnection: async () => true,
              uploadFile: async (_name, _bytes, current) => {
                signal = current;
                await new Promise<void>(resolve => {
                  finish = resolve;
                });
              },
              deleteFile: async () => {},
              dispose,
            }),
          });
        },
      }),
    })
  );
  await host.enable("test.publisher");
  expect(registry.list()).toEqual([{ id: "test.publisher", name: "发布器" }]);
  await registry.execute({ kind: "open", session: "one", pluginId: "test.publisher", config: {} });
  const upload = registry.execute({
    kind: "call",
    session: "one",
    method: "uploadFile",
    args: ["index.html", new Uint8Array([1])],
  });
  const disabled = host.disable("test.publisher");
  expect(signal.aborted).toBe(true);
  finish();
  await expect(upload).rejects.toMatchObject({ name: "AbortError" });
  await disabled;
  expect(dispose).toHaveBeenCalledOnce();
  expect(registry.list()).toEqual([]);
  await expect(
    registry.execute({ kind: "call", session: "one", method: "deleteFile", args: ["index.html"] })
  ).rejects.toThrow("已结束");
  await host.dispose();
});
it("插件身份、路径与并发上限在真实宿主及注册表检查", async () => {
  const registry = new RendererPublishRegistry();
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    publish: registry,
  });
  host.registerTrusted(
    definePlugin({
      id: "test.publisher",
      name: "发布器",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.publish.register({ id: "other.publisher", name: "伪造", create: vi.fn() });
        },
      }),
    })
  );
  await expect(host.enable("test.publisher")).rejects.toThrow("属于当前插件");
  expect(registry.list()).toEqual([]);
  await host.dispose();
});
