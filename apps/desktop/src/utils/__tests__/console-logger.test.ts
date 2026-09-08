import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// setupConsoleLogger 会整体替换 console 方法与 window 环境依赖，
// 每个用例通过 resetModules + 动态 import 获取全新模块状态，避免限流计数互相污染

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

async function loadFreshModule() {
  vi.resetModules();
  return import("../console-logger");
}

function installBridge() {
  const sendLog = vi.fn();
  (window as any).electron = { sendLog };
  return sendLog;
}

describe("setupConsoleLogger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as any).electron = undefined;
    Object.assign(console, originalConsole);
  });

  it("Web 环境无 sendLog 通道时不劫持 console", async () => {
    (window as any).electron = undefined;
    const { setupConsoleLogger } = await loadFreshModule();
    setupConsoleLogger();
    expect(console.log).toBe(originalConsole.log);
  });

  it("劫持后按级别上报且保留原输出", async () => {
    const originalLog = vi.fn();
    console.log = originalLog as unknown as typeof console.log;
    const sendLog = installBridge();

    const { setupConsoleLogger } = await loadFreshModule();
    setupConsoleLogger();

    console.log("hello");
    console.warn("careful");
    console.error("broken");

    expect(originalLog).toHaveBeenCalledWith("hello");
    expect(sendLog).toHaveBeenNthCalledWith(1, "info", "hello");
    expect(sendLog).toHaveBeenNthCalledWith(2, "warn", "careful");
    expect(sendLog).toHaveBeenNthCalledWith(3, "error", "broken");
  });

  it("对象序列化为 JSON、Error 输出堆栈、循环引用退化为 toString", async () => {
    const sendLog = installBridge();
    const { setupConsoleLogger } = await loadFreshModule();
    setupConsoleLogger();

    console.log({ answer: 42 });
    expect(sendLog).toHaveBeenLastCalledWith("info", '{"answer":42}');

    console.error(new Error("boom"));
    expect(vi.mocked(sendLog).mock.lastCall?.[1]).toContain("Error: boom");

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    console.log(circular);
    expect(vi.mocked(sendLog).mock.lastCall?.[1]).toBe(String(circular));
  });

  it("超长消息截断到上限", async () => {
    const sendLog = installBridge();
    const { setupConsoleLogger } = await loadFreshModule();
    setupConsoleLogger();

    console.log("x".repeat(5000));
    const message = vi.mocked(sendLog).mock.lastCall?.[1] ?? "";
    expect(message.length).toBe(4001);
    expect(message.endsWith("…")).toBe(true);
  });

  it("每秒超出限流阈值的日志被丢弃并在下一窗口提示", async () => {
    const sendLog = installBridge();
    const { setupConsoleLogger } = await loadFreshModule();
    setupConsoleLogger();

    for (let i = 0; i < 105; i += 1) {
      console.log(`msg-${i}`);
    }
    expect(sendLog).toHaveBeenCalledTimes(100);

    vi.advanceTimersByTime(1100);
    console.log("next-window");
    // 下一窗口首条为限流丢弃提示，随后是正常日志
    expect(sendLog).toHaveBeenNthCalledWith(101, "warn", expect.stringContaining("丢弃了 5 条"));
    expect(sendLog).toHaveBeenNthCalledWith(102, "info", "next-window");
  });

  it("未捕获异常与未处理 Promise 拒绝会上报", async () => {
    const sendLog = installBridge();
    const { setupConsoleLogger } = await loadFreshModule();
    setupConsoleLogger();

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Script error",
        filename: "app.js",
        lineno: 1,
        colno: 2,
        error: new Error("Script error"),
      })
    );
    expect(sendLog).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("Uncaught Script error @ app.js:1:2")
    );

    // jsdom 未实现 PromiseRejectionEvent 构造器，用普通事件携带 reason 模拟
    const rejectionEvent = new Event("unhandledrejection");
    (rejectionEvent as unknown as { reason: unknown }).reason = "网络超时";
    window.dispatchEvent(rejectionEvent);
    expect(vi.mocked(sendLog).mock.lastCall?.[1]).toContain("UnhandledRejection");
  });
});
