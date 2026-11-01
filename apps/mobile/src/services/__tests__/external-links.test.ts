import { afterEach, expect, it, vi } from "vitest";
import { installExternalLinkBridge } from "../external-links";

let release: (() => void) | undefined;
afterEach(() => {
  release?.();
  release = undefined;
  vi.unstubAllGlobals();
});

it("所有插件的新窗口外链统一转给系统，返回空窗口且不创建原生弹窗", async () => {
  const original = vi.fn<Window["open"]>().mockReturnValue(null);
  vi.stubGlobal("open", original);
  const open = vi.fn<(url: string) => Promise<void>>(async () => undefined);
  const error = vi.fn();
  release = installExternalLinkBridge(window, open, error);
  for (const url of [
    "https://example.com/key",
    "http://example.com/book",
    "mailto:test@example.com",
    "tel:10086",
  ])
    expect(window.open(url, "_blank", "noopener,noreferrer")).toBeNull();
  expect(open.mock.calls.map(call => call[0])).toEqual([
    "https://example.com/key",
    "http://example.com/book",
    "mailto:test@example.com",
    "tel:10086",
  ]);
  expect(original).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

it("系统打开失败有统一提示，Promise 不产生未处理拒绝", async () => {
  vi.stubGlobal("open", vi.fn<Window["open"]>().mockReturnValue(null));
  const error = vi.fn();
  release = installExternalLinkBridge(
    window,
    async () => {
      throw new Error("native failure");
    },
    error
  );
  window.open("https://example.com");
  await vi.waitFor(() => expect(error).toHaveBeenCalledWith("无法打开外部链接，请稍后重试"));
});

it("清理后恢复原方法，旧请求的迟到失败不显示到新宿主", async () => {
  const original = vi.fn<Window["open"]>().mockReturnValue(null);
  vi.stubGlobal("open", original);
  let reject!: (error: Error) => void;
  const error = vi.fn();
  release = installExternalLinkBridge(
    window,
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    error
  );
  window.open("https://example.com");
  release();
  reject(new Error("late failure"));
  await Promise.resolve();
  await Promise.resolve();
  expect(window.open).toBe(original);
  expect(error).not.toHaveBeenCalled();
});
