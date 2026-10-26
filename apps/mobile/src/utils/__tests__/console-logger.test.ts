import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLogValue, setupConsoleLogger } from "../console-logger";

type Bridge = { __TAURI_INTERNALS__?: unknown };
const METHODS = ["log", "info", "warn", "error", "debug"] as const;

describe("console-logger", () => {
  const sent: Array<[string, string]> = [];
  const send = (level: string, message: string) => {
    sent.push([level, message]);
  };
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    sent.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    for (const method of METHODS) vi.spyOn(console, method).mockImplementation(() => undefined);
  });

  afterEach(() => {
    teardown?.();
    teardown = null;
    delete (globalThis as Bridge).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("非 Tauri 环境不安装，保留原生 console", () => {
    const original = console.log;
    expect(setupConsoleLogger(send)).toBeNull();
    expect(console.log).toBe(original);
    expect(sent).toEqual([]);
  });

  it("按级别上报并保留原输出，卸载后恢复", () => {
    (globalThis as Bridge).__TAURI_INTERNALS__ = {};
    const originalWarn = console.warn;
    teardown = setupConsoleLogger(send);
    expect(console.warn).not.toBe(originalWarn);

    console.log("a", { b: 1 });
    console.warn(new Error("boom"));
    console.debug("d");
    console.error("e", 1);

    expect(sent[0]).toEqual(["info", 'a {"b":1}']);
    expect(sent[1][0]).toBe("warn");
    expect(sent[1][1]).toContain("boom");
    expect(sent[2]).toEqual(["debug", "d"]);
    expect(sent[3]).toEqual(["error", "e 1"]);
    expect(originalWarn).toHaveBeenCalledTimes(1);

    teardown?.();
    teardown = null;
    expect(console.warn).toBe(originalWarn);
    console.log("after");
    expect(sent).toHaveLength(4);
  });

  it("超长消息按 4000 字截断", () => {
    (globalThis as Bridge).__TAURI_INTERNALS__ = {};
    teardown = setupConsoleLogger(send);
    console.log("x".repeat(5000));
    expect(sent[0][1]).toHaveLength(4001);
    expect(sent[0][1].endsWith("…")).toBe(true);
  });

  it("每秒超过 100 条即丢弃，并在下一窗口汇总丢弃数", () => {
    (globalThis as Bridge).__TAURI_INTERNALS__ = {};
    teardown = setupConsoleLogger(send);
    for (let index = 0; index < 150; index += 1) console.log(`m${index}`);
    expect(sent).toHaveLength(100);
    expect(sent[99]).toEqual(["info", "m99"]);

    vi.setSystemTime(11_000);
    console.log("next");
    expect(sent).toHaveLength(102);
    expect(sent[100]).toEqual(["warn", "[console-logger] 触发限流，上一秒丢弃了 50 条日志"]);
    expect(sent[101]).toEqual(["info", "next"]);
  });

  it("上报未捕获异常与未处理拒绝，忽略无 message 的资源错误", () => {
    (globalThis as Bridge).__TAURI_INTERNALS__ = {};
    teardown = setupConsoleLogger(send);
    window.dispatchEvent(
      new ErrorEvent("error", { message: "oops", filename: "a.js", lineno: 3, colno: 7 })
    );
    window.dispatchEvent(new ErrorEvent("error", { message: "" }));
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: new Error("rejected") })
    );
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(["error", "Uncaught oops @ a.js:3:7"]);
    expect(sent[1][0]).toBe("error");
    expect(sent[1][1]).toMatch(/^UnhandledRejection .*rejected/);
  });

  it("formatLogValue 对无法序列化的值退化为 toString", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatLogValue(circular)).toBe("[object Object]");
    expect(formatLogValue(undefined)).toBe("undefined");
    expect(formatLogValue("s")).toBe("s");
  });
});
