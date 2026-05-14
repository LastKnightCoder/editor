import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

describe("audio cache url validation", () => {
  it("Bilibili 音频缓存拒绝非 http(s) 与本机地址", async () => {
    const { validateBilibiliAudioCacheOptions } =
      await import("../bilibili-audio-cache");

    expect(() =>
      validateBilibiliAudioCacheOptions({
        audioUrl: "file:///tmp/audio.m4a",
        bvid: "BV1",
        cid: "1",
      }),
    ).toThrow(/http\/https/);

    expect(() =>
      validateBilibiliAudioCacheOptions({
        audioUrl: "http://127.0.0.1:8000/audio.m4a",
        bvid: "BV1",
        cid: "1",
      }),
    ).toThrow(/本机|内网/);
  });

  it("YouTube 音频缓存拒绝非 http(s) 与本机地址", async () => {
    const { validateYoutubeAudioCacheOptions } =
      await import("../youtube-audio-cache");

    expect(() =>
      validateYoutubeAudioCacheOptions({
        url: "file:///tmp/video",
        audioStream: { id: "140" } as any,
      }),
    ).toThrow(/http\/https/);

    expect(() =>
      validateYoutubeAudioCacheOptions({
        url: "http://localhost:8080/video",
        audioStream: { id: "140" } as any,
      }),
    ).toThrow(/本机|内网/);
  });
});
