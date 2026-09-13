import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// electron.ts 的 bridge 与 ipcReady 均为模块级状态，每个用例 resetModules
// 后动态 import，先注入 window.electron 再取模块
async function importElectronModule(bridge?: unknown) {
  vi.resetModules();
  if (bridge === undefined) {
    delete (window as { electron?: unknown }).electron;
  } else {
    (window as { electron?: unknown }).electron = bridge;
  }
  return await import("@/electron");
}

function createNoHandlerError(channel: string) {
  return new Error(`No handler registered for '${channel}'`);
}

describe("electron 门面（原生 IPC）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as { electron?: unknown }).electron;
  });

  it("启动竞态兜底：No handler registered 失败后按间隔重试直至成功", async () => {
    const invokeMock = vi.fn();
    invokeMock
      .mockRejectedValueOnce(createNoHandlerError("pending-channel"))
      .mockRejectedValueOnce(createNoHandlerError("pending-channel"))
      .mockResolvedValueOnce("ok");
    const { invoke } = await importElectronModule({ invoke: invokeMock });

    const expectation = expect(invoke("pending-channel")).resolves.toBe("ok");
    // 推进两轮 500ms 重试间隔
    await vi.advanceTimersByTimeAsync(1200);
    await expectation;
    expect(invokeMock).toHaveBeenCalledTimes(3);
  });

  it("收到过成功响应后，No handler registered 视为确定性错误立即抛出", async () => {
    const invokeMock = vi.fn();
    invokeMock.mockResolvedValueOnce("first");
    invokeMock.mockRejectedValueOnce(createNoHandlerError("typo-channel"));
    const { invoke } = await importElectronModule({ invoke: invokeMock });

    await expect(invoke("ready-channel")).resolves.toBe("first");
    await expect(invoke("typo-channel")).rejects.toThrow("No handler registered");
    // 就绪后不再进入重试循环
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("非 No handler registered 错误不重试直接抛出", async () => {
    const invokeMock = vi.fn().mockRejectedValue(new Error("handler 内部错误"));
    const { invoke } = await importElectronModule({ invoke: invokeMock });

    await expect(invoke("broken-channel")).rejects.toThrow("handler 内部错误");
    await vi.advanceTimersByTimeAsync(6000);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("持续 No handler registered 超过重试窗口后抛出最后一次错误", async () => {
    const invokeMock = vi.fn().mockRejectedValue(createNoHandlerError("late-channel"));
    const { invoke } = await importElectronModule({ invoke: invokeMock });

    const expectation = expect(invoke("late-channel")).rejects.toThrow("No handler registered");
    await vi.advanceTimersByTimeAsync(6000);
    await expectation;
    // 5s 窗口内每 500ms 一次（含 t=0 与 t=5000），随后放弃
    expect(invokeMock).toHaveBeenCalledTimes(11);
  });

  it("无 bridge 时：on/off 静默、send 告警丢弃、invoke 抛错", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { invoke, send, on, off } = await importElectronModule(undefined);

    expect(() => on("any-channel", () => {})).not.toThrow();
    expect(() => off("any-channel", () => {})).not.toThrow();
    expect(() => send("any-channel", 1)).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
    await expect(invoke("any-channel")).rejects.toThrow("Electron API is not available");
  });
});
