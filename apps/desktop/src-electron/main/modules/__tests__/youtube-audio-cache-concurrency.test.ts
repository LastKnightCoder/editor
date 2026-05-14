import os from "node:os";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appDir = path.join(os.tmpdir(), "tau-youtube-audio-cache-test");
const downloadVideo = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("../../utils/PathUtil", () => ({
  default: {
    getAppDir: () => appDir,
  },
}));

vi.mock("../../utils/YtDlpService", () => ({
  default: {
    downloadVideo,
  },
}));

describe("youtube audio cache concurrency", () => {
  beforeEach(async () => {
    await rm(appDir, { recursive: true, force: true });
    await mkdir(appDir, { recursive: true });
    downloadVideo.mockReset();
  });

  afterEach(async () => {
    await rm(appDir, { recursive: true, force: true });
  });

  it("相同 URL 的并发缓存请求只触发一次下载", async () => {
    const { cacheYoutubeAudio } = await import("../youtube-audio-cache");
    downloadVideo.mockImplementation(async ({ outputDir, basename }) => {
      const outputPath = path.join(outputDir, `${basename}.m4a`);
      await writeFile(outputPath, "audio");
      return { outputPath, fileSize: 5 };
    });

    const options = {
      url: "https://www.youtube.com/watch?v=abc",
      audioStream: { id: "140" } as any,
    };

    const [first, second] = await Promise.all([
      cacheYoutubeAudio(options, 1),
      cacheYoutubeAudio(options, 2),
    ]);

    expect(downloadVideo).toHaveBeenCalledTimes(1);
    expect(first.localPath).toBe(second.localPath);
  });
});
