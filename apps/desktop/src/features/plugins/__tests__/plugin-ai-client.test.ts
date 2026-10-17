import { afterEach, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({
  listeners: new Set<(...args: any[]) => void>(),
  invoke: vi.fn(),
}));
vi.mock("@/electron", () => ({
  on: (_channel: string, listener: (...args: any[]) => void) => bridge.listeners.add(listener),
  off: (_channel: string, listener: (...args: any[]) => void) => bridge.listeners.delete(listener),
}));
vi.mock("@/commands/plugin-ai", () => ({ invokePluginAI: bridge.invoke }));
vi.mock("@/services/page-navigation", () => ({ openPage: vi.fn() }));
import { desktopPluginAI } from "@/app/plugins/ai";

afterEach(() => {
  bridge.invoke.mockReset();
  bridge.listeners.clear();
});
it("流式 IPC 跳过 Electron 事件参数，只向调用者交付文本和最终用量", async () => {
  bridge.invoke.mockImplementation(async (channel, args) => {
    if (channel === "register") return "session";
    if (channel === "run") {
      for (const listener of bridge.listeners)
        listener({}, { requestId: "other", delta: "其他请求" });
      for (const listener of bridge.listeners)
        listener({}, { requestId: args.requestId, delta: "你好" });
      return { ok: true, result: { text: "你好", usage: null } };
    }
  });
  const lifetime = new AbortController();
  const ai = await desktopPluginAI.bind(
    { id: "test", name: "测试" },
    [{ id: "chat", name: "对话" }],
    lifetime.signal
  );
  const events = [];
  for await (const event of ai.stream({
    feature: "chat",
    messages: [{ role: "user", content: "hello" }],
  }))
    events.push(event);
  expect(events).toEqual([
    { type: "text", delta: "你好" },
    { type: "done", result: { text: "你好", usage: null } },
  ]);
  expect(bridge.listeners.size).toBe(0);
  lifetime.abort();
  expect(bridge.invoke).toHaveBeenCalledWith("unregister", "session");
});

it("插件在绑定完成前停用时回收迟到的主进程登记", async () => {
  let finish!: (value: string) => void;
  bridge.invoke.mockImplementation(channel =>
    channel === "register"
      ? new Promise(resolve => {
          finish = resolve;
        })
      : Promise.resolve()
  );
  const lifetime = new AbortController();
  const binding = desktopPluginAI.bind({ id: "test", name: "测试" }, [], lifetime.signal);
  const rejected = expect(binding).rejects.toThrow();
  lifetime.abort();
  finish("late-session");
  await rejected;
  expect(bridge.invoke).toHaveBeenCalledWith("unregister", "late-session");
});

it("用户中止请求时向主进程取消并清理流监听", async () => {
  let finish!: (value: unknown) => void;
  bridge.invoke.mockImplementation(channel =>
    channel === "register"
      ? Promise.resolve("session")
      : channel === "run"
        ? new Promise(resolve => {
            finish = resolve;
          })
        : Promise.resolve()
  );
  const ai = await desktopPluginAI.bind(
    { id: "test", name: "测试" },
    [],
    new AbortController().signal
  );
  const controller = new AbortController();
  const pending = ai.chat({
    feature: "chat",
    messages: [{ role: "user", content: "hello" }],
    signal: controller.signal,
  });
  const failure = expect(pending).rejects.toThrow();
  controller.abort();
  await failure;
  expect(bridge.invoke).toHaveBeenCalledWith(
    "cancel-own",
    expect.objectContaining({ session: "session" })
  );
  expect(bridge.listeners.size).toBe(0);
  finish({ ok: false, error: "AI_ABORTED" });
});
