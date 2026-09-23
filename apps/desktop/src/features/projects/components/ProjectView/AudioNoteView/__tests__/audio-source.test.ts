import { describe, expect, it, vi } from "vitest";

const getYoutubeAudioCacheStatus = vi.hoisted(() => vi.fn());
const cacheYoutubeAudio = vi.hoisted(() => vi.fn());
const getBilibiliAudioCacheStatus = vi.hoisted(() => vi.fn());
const cacheBilibiliAudio = vi.hoisted(() => vi.fn());
const getPlayUrl = vi.hoisted(() => vi.fn());
const checkStreamAvailability = vi.hoisted(() => vi.fn());

vi.mock("@/commands", () => ({
  getYoutubeAudioCacheStatus,
  cacheYoutubeAudio,
  getBilibiliAudioCacheStatus,
  cacheBilibiliAudio,
}));

vi.mock("@/utils/bilibili", () => ({
  getPlayUrl,
  checkStreamAvailability,
}));

describe("resolveAudioPathForTranscription", () => {
  it("YouTube 音频未缓存时应触发缓存并返回本地路径", async () => {
    const { resolveAudioPathForTranscription } = await import("../audio-source");
    getYoutubeAudioCacheStatus.mockResolvedValue(null);
    cacheYoutubeAudio.mockResolvedValue({
      localPath: "/tmp/youtube.m4a",
      cached: false,
      fileSize: 10,
    });

    const path = await resolveAudioPathForTranscription(
      {
        type: "youtube",
        url: "https://www.youtube.com/watch?v=abc",
        audioStream: { id: "140" } as any,
      },
      { youtubeProxy: "http://proxy.local:8080" }
    );

    expect(path).toBe("/tmp/youtube.m4a");
    expect(cacheYoutubeAudio).toHaveBeenCalledWith({
      url: "https://www.youtube.com/watch?v=abc",
      audioStream: { id: "140" },
      proxy: "http://proxy.local:8080",
    });
  });

  it("Bilibili 音频未缓存时应获取播放地址并缓存", async () => {
    const { resolveAudioPathForTranscription } = await import("../audio-source");
    getBilibiliAudioCacheStatus.mockResolvedValue(null);
    getPlayUrl.mockResolvedValue({ audio: "https://upos.example/audio.m4a" });
    checkStreamAvailability.mockResolvedValue({
      audioAvailable: true,
      videoAvailable: true,
    });
    cacheBilibiliAudio.mockResolvedValue({
      localPath: "/tmp/bilibili.m4a",
      cached: false,
      fileSize: 10,
    });

    const path = await resolveAudioPathForTranscription(
      {
        type: "bilibili",
        bvid: "BV1",
        cid: "123",
        quality: 80,
        title: "标题",
      },
      { bilibiliCredentials: { SESSDATA: "sess" } as any }
    );

    expect(path).toBe("/tmp/bilibili.m4a");
    expect(cacheBilibiliAudio).toHaveBeenCalledWith({
      audioUrl: "https://upos.example/audio.m4a",
      bvid: "BV1",
      cid: "123",
      title: "标题",
    });
  });
});
