import { expect, it, vi } from "vitest";
import { definePlugin, type PluginStorage } from "@tau/plugins";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { IPluginStorage, defineWhiteboardExtension } from "@tau/plugins/whiteboard";
import { createServiceRegistry } from "@tau/shared/service-registry";
import { createWhiteboardPluginServices } from "@/app/plugins/whiteboard-services";

it("私有存储随插件与工作区隔离，重建恢复，旧画布不会接管新激活实例", async () => {
  const adapter = createMemoryStorage();
  const definitions = ["demo.one", "demo.two"].map(id =>
    definePlugin({
      id,
      name: id,
      version: "1.0.0",
      whiteboardExtensions: [
        defineWhiteboardExtension({
          id,

          create: () => ({}),
        }),
      ],
    })
  );
  const open = async (workspaceId: string) => {
    const host = new PluginHost({ workspaceId, storage: adapter });
    for (const definition of definitions) {
      host.registerTrusted(definition);
      await host.enable(definition.id);
    }
    const services = createServiceRegistry();
    const resolve = createWhiteboardPluginServices(services, definitions, id =>
      host.getStorage(id)
    );
    let active = true;
    const api = { captureSubmission: () => () => active };
    expect(resolve("tau.other", api).has(IPluginStorage)).toBe(false);
    return {
      host,
      close: () => {
        active = false;
      },
      one: resolve("demo.one", api).get(IPluginStorage),
      two: resolve("demo.two", api).get(IPluginStorage),
    };
  };
  const a = await open("a");
  const b = await open("b");
  try {
    await a.one.set("style", { body: "bean" });
    expect(await a.two.get("style")).toBeUndefined();
    expect(await b.one.get("style")).toBeUndefined();
    b.close();
    await expect(b.one.set("style", { body: "glyph" })).rejects.toThrow("不可交互");
    await a.host.disable("demo.one");
    await expect(a.one.set("style", { body: "glyph" })).rejects.toThrow();
    await a.host.enable("demo.one");
    await expect(a.one.set("style", { body: "glyph" })).rejects.toThrow("激活实例已改变");
    await a.host.dispose();
    const reopened = await open("a");
    try {
      expect(await reopened.one.get("style")).toEqual({ body: "bean" });
    } finally {
      await reopened.host.dispose();
    }
  } finally {
    await a.host.dispose();
    await b.host.dispose();
  }
});

it("读取偏好期间关闭画布，迟到结果不能继续触发保存", async () => {
  let finish!: (value: undefined) => void;
  const storage: PluginStorage = {
    get: () =>
      new Promise(resolve => {
        finish = resolve;
      }),
    set: vi.fn(async () => undefined),
    delete: async () => undefined,
  };
  const definition = definePlugin({
    id: "demo.wait",
    name: "等待",
    version: "1.0.0",
    whiteboardExtensions: [defineWhiteboardExtension({ id: "demo.wait", create: () => ({}) })],
  });
  let active = true;
  const resolve = createWhiteboardPluginServices(
    createServiceRegistry(),
    [definition],
    () => storage
  );
  const scoped = resolve("demo.wait", { captureSubmission: () => () => active }).get(
    IPluginStorage
  );
  const pending = scoped.get("style").then(() => scoped.set("style", { body: "bean" }));
  const rejected = expect(pending).rejects.toThrow("交互已结束");
  active = false;
  finish(undefined);
  await rejected;
  expect(storage.set).not.toHaveBeenCalled();
});
