import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

import { normalizeYoutubeDownloadErrorMessage } from "../youtube-cache";

describe("youtube-cache error mapping", () => {
  it("应将 js runtime 相关错误映射为友好提示", () => {
    const message = normalizeYoutubeDownloadErrorMessage(
      "WARNING: [youtube] No supported JavaScript runtime could be found",
    );
    expect(message).toBe("应用内运行环境异常，请重启应用后重试");
  });

  it("应将格式不可用错误映射为自动回退提示", () => {
    const message = normalizeYoutubeDownloadErrorMessage(
      "ERROR: [youtube] Requested format is not available",
    );
    expect(message).toBe("所选清晰度不可用，已自动回退最佳可用格式，请重试");
  });

  it("应将未知错误映射为通用提示", () => {
    const message = normalizeYoutubeDownloadErrorMessage(
      "ERROR: something else",
    );
    expect(message).toBe("下载失败，请稍后重试或尝试其他视频链接");
  });
});
