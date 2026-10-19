// @vitest-environment node
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));

const { PluginVideoRelay } = await import("../plugin-video");

const window = (id: number) =>
  Object.assign(new EventEmitter(), {
    id,
    send: vi.fn(),
    isDestroyed: () => false,
  }) as unknown as WebContents;

const sent = (contents: WebContents, channel: string) =>
  vi.mocked(contents.send).mock.calls.filter(call => call[0] === channel);

it("请求转发到主窗口宿主，只接受同一宿主会话的回复", async () => {
  const relay = new PluginVideoRelay();
  const host = window(1);
  relay.connect(host, "session");
  const pending = relay.request(window(2), "a", { kind: "match", url: "https://v.test/1" });
  const [, message] = sent(host, "plugin-video:request")[0];
  expect(message).toMatchObject({ requestId: "a", hostSession: "session" });
  relay.reply(1, { requestId: "a", hostSession: "stale", result: "wrong" });
  relay.reply(3, { requestId: "a", hostSession: "session", result: "wrong" });
  relay.reply(1, { requestId: "a", hostSession: "session", result: "test.video" });
  expect(await pending).toBe("test.video");
});

it("插件错误保留名称；无宿主时明确报错", async () => {
  const relay = new PluginVideoRelay();
  await expect(relay.request(null, "x", { kind: "match", url: "u" })).rejects.toThrow(
    "主窗口插件宿主不可用"
  );
  relay.connect(window(1), "session");
  const pending = relay.request(null, "b", { kind: "match", url: "u" });
  relay.reply(1, { requestId: "b", hostSession: "session", error: "失败", errorName: "TypeError" });
  await expect(pending).rejects.toMatchObject({ message: "失败", name: "TypeError" });
});

it("只有调用方能取消；调用窗口或宿主关闭时回收等待并通知插件侧", async () => {
  const relay = new PluginVideoRelay();
  const host = window(1);
  const caller = window(2);
  relay.connect(host, "session");
  const first = relay.request(caller, "a", { kind: "match", url: "u" });
  relay.cancel(3, "a");
  relay.cancel(2, "a");
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  const second = relay.request(caller, "b", { kind: "match", url: "u" });
  caller.emit("destroyed");
  await expect(second).rejects.toMatchObject({ name: "AbortError" });
  const third = relay.request(null, "c", { kind: "match", url: "u" });
  host.emit("render-process-gone");
  await expect(third).rejects.toMatchObject({ name: "AbortError" });
  expect(sent(host, "plugin-video:cancel")).toHaveLength(3);
});

it("主进程调用的取消信号转发给宿主；过期会话的释放不影响新宿主", async () => {
  const relay = new PluginVideoRelay();
  const host = window(1);
  relay.connect(host, "old");
  relay.connect(host, "new");
  relay.release(1, "old");
  expect(relay.providers()).toEqual({ ready: false, providers: [] });
  relay.publish(1, "new", { ready: true, providers: [{ id: "test.video", name: "视频" }] });
  expect(relay.providers()).toEqual({
    ready: true,
    providers: [{ id: "test.video", name: "视频" }],
  });
  const controller = new AbortController();
  const pending = relay.call({ kind: "match", url: "u" }, controller.signal);
  await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(sent(host, "plugin-video:cancel")).toHaveLength(1);
});
