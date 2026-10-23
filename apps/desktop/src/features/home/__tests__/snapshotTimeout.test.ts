import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withSnapshotTimeout } from "../queries";

vi.mock("@/features/todos/queries", () => ({ ensureTodoSnapshot: vi.fn() }));

describe("快照查询超时保护", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("请求成功后保留返回值并清除定时器，不再误报超时", async () => {
    const snapshot = { todos: [] };

    await expect(withSnapshotTimeout(Promise.resolve(snapshot), "今日页快照")).resolves.toBe(
      snapshot
    );

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("请求失败后保留原始错误并清除定时器，不再误报超时", async () => {
    const error = new Error("请求失败");

    await expect(withSnapshotTimeout(Promise.reject(error), "今日页快照")).rejects.toBe(error);

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each(["成功", "失败"])("真正超时只记录一次日志，迟到的%s不改变超时结果", async outcome => {
    let resolveRequest!: (value: string) => void;
    let rejectRequest!: (reason: Error) => void;
    const request = new Promise<string>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    const result = withSnapshotTimeout(request, "今日页快照");
    const rejection = expect(result).rejects.toThrow("今日页快照 超时（30000ms）");

    await vi.advanceTimersByTimeAsync(29_999);
    expect(console.error).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "[home] 今日页快照 30000ms 未返回，疑似 IPC 挂起"
    );
    expect(vi.getTimerCount()).toBe(0);

    if (outcome === "成功") resolveRequest("迟到的快照");
    else rejectRequest(new Error("迟到的失败"));

    await vi.advanceTimersByTimeAsync(30_000);
    await expect(result).rejects.toThrow("今日页快照 超时（30000ms）");
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
