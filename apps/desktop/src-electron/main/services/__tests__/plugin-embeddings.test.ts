// @vitest-environment node
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PluginEmbeddingsRelay } from "../plugin-embeddings";
import type { EmbeddingsRendererMessage } from "../../../../shared/embeddings-renderer";

const window = (id: number) =>
  Object.assign(new EventEmitter(), {
    id,
    send: vi.fn(),
    isDestroyed: () => false,
  }) as unknown as WebContents;

const provider = { pluginId: "test.embedding", maxBatchSize: 8 };

/** 从宿主收到的请求消息（embed 内部 await validate 后才发出，需先冲刷微任务） */
const sentRequest = (host: WebContents) => {
  const call = vi
    .mocked(host.send)
    .mock.calls.find(([channel]) => channel === "plugin-embeddings:request");
  if (!call) throw new Error("宿主未收到嵌入请求");
  return call[1] as EmbeddingsRendererMessage;
};

const flush = () => Promise.resolve().then(() => Promise.resolve());

let relay: PluginEmbeddingsRelay;
const validate = vi.fn(async () => undefined);

beforeEach(() => {
  // mockReset 清除上个用例注入的失败实现，避免泄漏到后续用例
  validate.mockReset();
  validate.mockImplementation(async () => undefined);
  relay = new PluginEmbeddingsRelay(validate);
});

afterEach(() => {
  vi.useRealTimers();
});

it("正常往返：请求带 generation，结果按 requestId 送回", async () => {
  const host = window(1);
  relay.connect(host, "gen-1", [provider]);
  expect(relay.isReady("test.embedding")).toBe(true);
  expect(relay.maxBatchSize("test.embedding")).toBe(8);

  const promise = relay.embed("test.embedding", { apiKey: "k" }, "m", ["你好"], undefined, 0);
  await flush();
  const message = sentRequest(host);
  expect(message).toMatchObject({
    hostSession: "gen-1",
    request: { pluginId: "test.embedding", config: { apiKey: "k" }, modelId: "m", texts: ["你好"] },
  });
  relay.reply(host.id, {
    requestId: message.requestId,
    hostSession: "gen-1",
    result: [[0.1, 0.2]],
  });
  await expect(promise).resolves.toEqual([[0.1, 0.2]]);
});

it("reply 的 generation 不符时被忽略，正确 generation 才送达", async () => {
  const host = window(1);
  relay.connect(host, "gen-1", [provider]);
  const promise = relay.embed("test.embedding", {}, "m", ["a"], undefined, 0);
  await flush();
  const { requestId } = sentRequest(host);
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  relay.reply(host.id, { requestId, hostSession: "stale", result: [[1]] });
  relay.reply(2, { requestId, hostSession: "gen-1", result: [[2]] });
  await flush();
  expect(settled).toBe(false);
  relay.reply(host.id, { requestId, hostSession: "gen-1", result: [[3]] });
  await expect(promise).resolves.toEqual([[3]]);
});

it("宿主 release 时以 AbortError 拒绝其名下全部 pending", async () => {
  const host = window(1);
  relay.connect(host, "gen-1", [provider]);
  const first = relay.embed("test.embedding", {}, "m", ["a"], undefined, 0);
  const second = relay.embed("test.embedding", {}, "m", ["b"], undefined, 0);
  await flush();
  relay.release(host.id, "gen-1");
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  await expect(second).rejects.toMatchObject({ name: "AbortError" });
  expect(relay.isReady("test.embedding")).toBe(false);
});

it("signal abort 会向宿主发 cancel 并以 AbortError 拒绝", async () => {
  const host = window(1);
  relay.connect(host, "gen-1", [provider]);
  const controller = new AbortController();
  const promise = relay.embed("test.embedding", {}, "m", ["a"], controller.signal, 0);
  await flush();
  const { requestId } = sentRequest(host);
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect(host.send).toHaveBeenCalledWith("plugin-embeddings:cancel", {
    requestId,
    hostSession: "gen-1",
  });
});

it("超时向宿主发 cancel 并以 TimeoutError 拒绝（区别于用户取消）", async () => {
  vi.useFakeTimers();
  const host = window(1);
  relay.connect(host, "gen-1", [provider]);
  const promise = relay.embed("test.embedding", {}, "m", ["a"], undefined, 1000);
  await flush();
  const { requestId } = sentRequest(host);
  // 先挂拒绝断言再推进时钟，避免 reject 发生在断言挂载前造成未处理拒绝
  const rejection = expect(promise).rejects.toMatchObject({
    message: "嵌入请求超时",
    name: "TimeoutError",
  });
  await vi.advanceTimersByTimeAsync(1000);
  await rejection;
  expect(host.send).toHaveBeenCalledWith("plugin-embeddings:cancel", {
    requestId,
    hostSession: "gen-1",
  });
});

it("没有可用宿主时报未就绪；provider 未包含该插件同样不算就绪", async () => {
  await expect(relay.embed("test.embedding", {}, "m", ["a"])).rejects.toThrow("嵌入插件未就绪");
  const host = window(1);
  relay.connect(host, "gen-1", [{ pluginId: "other.plugin" }]);
  await expect(relay.embed("test.embedding", {}, "m", ["a"])).rejects.toThrow("嵌入插件未就绪");
  expect(host.send).not.toHaveBeenCalledWith("plugin-embeddings:request", expect.anything());
});

it("宿主与 provider 集合变化时通知订阅者，取消订阅后不再通知", () => {
  const listener = vi.fn();
  const stop = relay.onProvidersChanged(listener);
  const host = window(1);
  relay.connect(host, "gen-1", [provider]);
  expect(listener).toHaveBeenCalledTimes(1);
  relay.update(host.id, "gen-1", [provider, { pluginId: "another" }]);
  expect(listener).toHaveBeenCalledTimes(2);
  relay.update(host.id, "stale", []);
  expect(listener).toHaveBeenCalledTimes(2);
  relay.release(host.id, "gen-1");
  expect(listener).toHaveBeenCalledTimes(3);
  stop();
  relay.connect(window(2), "gen-2", [provider]);
  expect(listener).toHaveBeenCalledTimes(3);
});

it("validate 失败时不向宿主发请求", async () => {
  validate.mockImplementation(async () => {
    throw new Error("嵌入插件尚未启用");
  });
  const host = window(1);
  relay.connect(host, "gen-1", [provider]);
  await expect(relay.embed("test.embedding", {}, "m", ["a"])).rejects.toThrow("嵌入插件尚未启用");
  expect(host.send).not.toHaveBeenCalled();
});

it("渲染端返回错误时透传 message 与 errorName", async () => {
  const host = window(1);
  relay.connect(host, "gen-1", [provider]);
  const promise = relay.embed("test.embedding", {}, "m", ["a"], undefined, 0);
  await flush();
  const { requestId } = sentRequest(host);
  relay.reply(host.id, {
    requestId,
    hostSession: "gen-1",
    error: "批量超限",
    errorName: "RangeError",
  });
  await expect(promise).rejects.toMatchObject({ message: "批量超限", name: "RangeError" });
});
