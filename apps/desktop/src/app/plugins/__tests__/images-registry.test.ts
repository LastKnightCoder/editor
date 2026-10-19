import { expect, it, vi } from "vitest";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { definePlugin, type ImageInstance, type JsonValue } from "@tau/plugins";
import { RendererImagesRegistry } from "../images-registry";

function setup(create: (config: JsonValue, model: string) => ImageInstance) {
  const registry = new RendererImagesRegistry();
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    images: registry,
  });
  host.registerTrusted(
    definePlugin({
      id: "test.images",
      name: "图片",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          context.images.register({ id: context.pluginId, name: "图片", create });
        },
      }),
    })
  );
  return { registry, host };
}
const open = (session: string, config: JsonValue = {}, modelId = "model") => ({
  kind: "open" as const,
  session,
  pluginId: "test.images",
  config,
  modelId,
});
const request = (session: string) => ({
  kind: "generate" as const,
  session,
  request: { prompt: "图片" },
});

it("固定账号与模型，取消单次任务不影响其他账号，停用回收所有会话", async () => {
  const calls: { config: JsonValue; model: string; signal: AbortSignal }[] = [];
  const { registry, host } = setup((config, model) => ({
    generate: async (_request, signal) => {
      calls.push({ config, model, signal });
      return new Promise(() => {});
    },
  }));
  await host.enable("test.images");
  const signal = new AbortController().signal;
  const config = { key: "a" };
  await registry.execute(open("a", config, "first"), signal);
  config.key = "changed";
  await registry.execute(open("b", { key: "b" }, "second"), signal);
  const cancel = new AbortController();
  const first = registry.execute(request("a"), cancel.signal);
  const second = registry.execute(request("b"), signal);
  const checkedFirst = expect(first).rejects.toMatchObject({ name: "AbortError" });
  const checkedSecond = expect(second).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  expect(calls.map(call => [call.config, call.model])).toEqual([
    [{ key: "a" }, "first"],
    [{ key: "b" }, "second"],
  ]);
  cancel.abort();
  await checkedFirst;
  expect(calls[1].signal.aborted).toBe(false);
  await host.disable("test.images");
  await checkedSecond;
  expect(calls[1].signal.aborted).toBe(true);
  await host.dispose();
});

it("按实例方法发布能力，拒绝不支持的操作和无效结果", async () => {
  const generate = vi.fn(async () => [
    { name: "invalid", mimeType: "image/png", content: new Uint8Array() },
  ]);
  const { registry, host } = setup(() => ({ generate }));
  await host.enable("test.images");
  const signal = new AbortController().signal;
  expect(await registry.execute(open("a"), signal)).toEqual({ canGenerate: true, canEdit: false });
  await expect(
    registry.execute(
      { kind: "edit", session: "a", request: { prompt: "改图", images: [] } },
      signal
    )
  ).rejects.toThrow("不支持");
  await expect(registry.execute(request("a"), signal)).rejects.toThrow("字节");
  await host.dispose();
});

it("取消后丢弃忽略信号的插件迟到结果，空实现不能创建任务", async () => {
  let complete!: (value: { name: string; mimeType: string; content: Uint8Array }[]) => void;
  const { registry, host } = setup(() => ({
    generate: () =>
      new Promise(resolve => {
        complete = resolve;
      }),
  }));
  await host.enable("test.images");
  const signal = new AbortController().signal;
  await registry.execute(open("a"), signal);
  const cancel = new AbortController();
  const pending = registry.execute(request("a"), cancel.signal);
  const checked = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  cancel.abort();
  complete([{ name: "a.png", mimeType: "image/png", content: new Uint8Array([1]) }]);
  await checked;
  await host.dispose();
  const empty = setup(() => ({}));
  await empty.host.enable("test.images");
  await expect(empty.registry.execute(open("empty"), signal)).rejects.toThrow("至少");
  await empty.host.dispose();
});
