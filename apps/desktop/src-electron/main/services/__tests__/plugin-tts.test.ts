// @vitest-environment node
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { PluginTTSRelay } from "../plugin-tts";
const window = (id: number) =>
  Object.assign(new EventEmitter(), {
    id,
    send: vi.fn(),
    isDestroyed: () => false,
  }) as unknown as WebContents;
const open = (session: string) => ({
  kind: "open" as const,
  session,
  pluginId: "test.tts",
  config: {},
  modelId: "a",
});
it("任务固定主窗口与调用者，外部窗口不能调用或取消；关闭回收等待", async () => {
  const relay = new PluginTTSRelay(),
    host = window(1),
    caller = window(2);
  relay.connect(host, "generation");
  const ready = relay.request(caller, "open", open("task"));
  relay.reply(1, { requestId: "open", hostSession: "generation", result: { canClone: false } });
  await ready;
  expect(() => relay.request(window(3), "forbidden", { kind: "voices", session: "task" })).toThrow(
    "不属于"
  );
  const pending = relay.request(caller, "synth", {
    kind: "synthesize",
    session: "task",
    request: { text: "a", voiceId: "v" },
  });
  const done = vi.fn();
  void pending.then(done);
  relay.cancel(3, "synth");
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  relay.connect(window(4), "another");
  caller.emit("destroyed");
  expect(await pending).toMatchObject({ errorName: "AbortError" });
  expect(vi.mocked(host.send).mock.calls.some(call => call[0] === "plugin-tts:close")).toBe(true);
  expect(
    await relay.request(caller, "close", { kind: "close", session: "task" })
  ).not.toHaveProperty("error");
});
it("取消开任务后迟到回复不能重新建立可调用任务", async () => {
  const relay = new PluginTTSRelay(),
    host = window(1),
    caller = window(2);
  relay.connect(host, "generation");
  const ready = relay.request(caller, "open", open("task"));
  relay.cancel(caller.id, "open");
  expect(await ready).toMatchObject({ errorName: "AbortError" });
  relay.reply(host.id, { requestId: "open", hostSession: "generation", result: {} });
  expect(await relay.request(caller, "voices", { kind: "voices", session: "task" })).toMatchObject({
    errorName: "AbortError",
  });
});
it("空闲会话关闭也通知调用窗口，拒绝其它宿主或旧代通知", async () => {
  const relay = new PluginTTSRelay(),
    host = window(1),
    caller = window(2);
  relay.connect(host, "generation");
  const ready = relay.request(caller, "open", open("idle"));
  relay.reply(1, { requestId: "open", hostSession: "generation", result: {} });
  await ready;
  relay.rendererClosed(3, "generation", "idle");
  relay.rendererClosed(1, "old", "idle");
  expect(caller.send).not.toHaveBeenCalled();
  relay.rendererClosed(1, "generation", "idle");
  expect(caller.send).toHaveBeenCalledWith("plugin-tts:session-closed", { session: "idle" });
  expect(await relay.request(caller, "voices", { kind: "voices", session: "idle" })).toMatchObject({
    errorName: "AbortError",
  });
});
