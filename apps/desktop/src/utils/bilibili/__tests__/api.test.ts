import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPlayUrl, getVideoInfoByUrl } from "../api";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/commands", () => ({
  desktopFetch: async (...args: unknown[]) => {
    const result = await fetchMock(...args);
    const response = new Response(
      typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.status ? result.data : result),
      { status: result.status ?? 200, headers: result.headers }
    );
    Object.defineProperty(response, "url", { value: result.finalUrl ?? String(args[0]) });
    return response;
  },
}));

const viewResponse = {
  code: 0,
  message: "0",
  data: {
    bvid: "BV1realreal1",
    aid: 123456,
    cid: 654321,
    title: "真实视频",
    pic: "https://i0.hdslb.com/cover.jpg",
    duration: 120,
    owner: { name: "UP", mid: 1 },
    stat: { view: 1, danmaku: 2, reply: 3 },
    pages: [{ cid: 654321, page: 1, part: "P1", duration: 120 }],
  },
};

const qualityResponse = {
  code: 0,
  message: "0",
  data: {
    accept_quality: [80, 64],
    dash: {
      video: [],
      audio: [],
    },
  },
};

describe("bilibili api", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("应跟随短链到视频页后复用现有视频信息解析", async () => {
    fetchMock
      .mockResolvedValueOnce({
        finalUrl: "https://www.bilibili.com/video/BV1realreal1",
        data: "",
        status: 200,
        headers: {},
      })
      .mockResolvedValueOnce(viewResponse)
      .mockResolvedValueOnce(qualityResponse);

    const info = await getVideoInfoByUrl("https://b23.tv/abc");

    expect(info.bvid).toBe("BV1realreal1");
    expect(info.cid).toBe("654321");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.bilibili.com/x/web-interface/view?bvid=BV1realreal1",
      expect.any(Object)
    );
  });

  it("应从动态页 HTML 中提取视频链接后解析真实 bvid 和 cid", async () => {
    fetchMock
      .mockResolvedValueOnce({
        finalUrl: "https://t.bilibili.com/987654321",
        data: '<a href="https://www.bilibili.com/video/BV1realreal1">视频</a>',
        status: 200,
        headers: {},
      })
      .mockResolvedValueOnce(viewResponse)
      .mockResolvedValueOnce(qualityResponse);

    const info = await getVideoInfoByUrl("https://t.bilibili.com/987654321");

    expect(info.bvid).toBe("BV1realreal1");
    expect(info.cid).toBe("654321");
  });

  it("应使用 aid 调用 B 站接口，让接口返回真实 bvid", async () => {
    fetchMock.mockResolvedValueOnce(viewResponse).mockResolvedValueOnce(qualityResponse);

    const info = await getVideoInfoByUrl("https://www.bilibili.com/video/av123456");

    expect(info.bvid).toBe("BV1realreal1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.bilibili.com/x/web-interface/view?aid=123456",
      expect.any(Object)
    );
  });

  it("请求的清晰度不存在时应从所有视频流中选择可用流", async () => {
    fetchMock
      .mockResolvedValueOnce({
        code: 0,
        message: "OK",
        data: {
          accept_quality: [64, 32, 16],
          dash: {
            video: [
              {
                id: 64,
                baseUrl: "https://video.example/720p.m4s",
              },
            ],
            audio: [
              {
                id: 30280,
                baseUrl: "https://audio.example/audio.m4s",
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const playUrl = await getPlayUrl("654321", "BV1realreal1", 80);

    expect(playUrl).toEqual({
      video: "https://video.example/720p.m4s",
      audio: "https://audio.example/audio.m4s",
      quality: 64,
    });
  });
});
