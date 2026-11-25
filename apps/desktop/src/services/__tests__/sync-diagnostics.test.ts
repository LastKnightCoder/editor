// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { traceSyncStage } from "../sync-diagnostics";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("请求仍在等待时记录所属阶段，完成后释放计时器且不记录返回数据", async () => {
  let finish!: (value: string) => void;
  const operation = traceSyncStage(
    "probe-id",
    "test.sync",
    "fileExists",
    () => new Promise<string>(resolve => (finish = resolve))
  );
  await vi.advanceTimersToNextTimerAsync();
  expect(console.warn).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      traceId: "probe-id",
      provider: "test.sync",
      stage: "fileExists",
      elapsedMs: expect.any(Number),
    })
  );
  finish("sensitive-result");
  await operation;
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("sensitive-result");
  expect(vi.getTimerCount()).toBe(0);
});

it("失败保留原始错误并释放计时器，日志只提取状态码而不泄露错误正文与凭据", async () => {
  const error = Object.assign(new Error("https://user:secret@example.test/private?token=secret"), {
    $metadata: { httpStatusCode: 403, authorization: "sensitive-authorization" },
    config: { secretAccessKey: "sensitive-key" },
  });
  await expect(
    traceSyncStage("probe-id", "test.sync", "fileExists", async () => {
      throw error;
    })
  ).rejects.toBe(error);
  expect(console.warn).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ errorName: "Error", httpStatus: 403 })
  );
  const logs = JSON.stringify([
    ...vi.mocked(console.info).mock.calls,
    ...vi.mocked(console.warn).mock.calls,
  ]);
  expect(logs).not.toContain("secret");
  expect(logs).not.toContain("sensitive-");
  expect(logs).not.toContain("example.test");
  expect(vi.getTimerCount()).toBe(0);
});
