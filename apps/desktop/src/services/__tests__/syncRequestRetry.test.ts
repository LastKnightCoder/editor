// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { ISyncProvider } from "@/types/sync";
import { sleep } from "@/utils/sleep";
import { withSyncRequestRetry } from "../syncRequestRetry";

vi.mock("@/utils/sleep", () => ({ sleep: vi.fn(async () => undefined) }));
beforeEach(() => {
  vi.clearAllMocks();
});

function fixture() {
  return {
    uploadFile: vi.fn(async () => true),
    downloadFile: vi.fn(async () => new Uint8Array([1])),
    fileExists: vi.fn(async () => true),
    listFiles: vi.fn(async () => []),
    createFileIfAbsent: vi.fn(async () => false),
    deleteFile: vi.fn(async () => false),
    getProviderName: () => "test.sync",
    dispose: vi.fn(async () => undefined),
  } satisfies ISyncProvider;
}

it.each(["fileExists", "downloadFile", "listFiles"] as const)(
  "%s 超时只重试当前请求",
  async method => {
    const provider = fixture();
    provider[method].mockRejectedValueOnce(
      new DOMException("The operation timed out.", "TimeoutError")
    );
    const retry = withSyncRequestRetry(provider);
    await retry[method]("object");
    expect(provider[method]).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  }
);

it("上传 false 也有限重试，相同内容最多发送四次", async () => {
  const provider = fixture();
  provider.uploadFile.mockResolvedValue(false);
  const bytes = new Uint8Array([1]);
  await expect(withSyncRequestRetry(provider).uploadFile("chunk", bytes)).rejects.toThrow(
    "上传失败"
  );
  expect(provider.uploadFile).toHaveBeenCalledTimes(4);
  for (const args of provider.uploadFile.mock.calls) expect(args).toEqual(["chunk", bytes]);
  expect(vi.mocked(sleep).mock.calls).toEqual([[1000], [2000], [4000]]);
});

it.each(["fetch failed", "Failed to fetch", "ECONNRESET", "HTTP 429", "HTTP 503"])(
  "宿主网络与服务端临时错误可恢复：%s",
  async message => {
    const provider = fixture();
    provider.downloadFile.mockRejectedValueOnce(new TypeError(message));
    expect(await withSyncRequestRetry(provider).downloadFile("chunk")).toEqual(new Uint8Array([1]));
    expect(provider.downloadFile).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  }
);

it.each([
  new Error("OSS读取失败：403"),
  new Error("同步任务已结束"),
  new Error("同步分块内容校验失败"),
  new DOMException("请求取消", "AbortError"),
])("永久错误与取消不重试：%s", async error => {
  const provider = fixture();
  provider.downloadFile.mockRejectedValue(error);
  await expect(withSyncRequestRetry(provider).downloadFile("object")).rejects.toBe(error);
  expect(provider.downloadFile).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

it("原子防覆盖请求不自动重放，资源和提供方生命周期不进入重试", async () => {
  const provider = fixture();
  provider.createFileIfAbsent.mockRejectedValue(new Error("network timeout"));
  const retry = withSyncRequestRetry(provider);
  await expect(retry.createFileIfAbsent("object", new Uint8Array())).rejects.toThrow("timeout");
  await retry.dispose?.();
  expect(provider.createFileIfAbsent).toHaveBeenCalledTimes(1);
  expect(provider.dispose).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});
