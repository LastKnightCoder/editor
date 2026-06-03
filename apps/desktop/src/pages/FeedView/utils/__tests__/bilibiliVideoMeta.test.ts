import { describe, expect, it, vi } from "vitest";
import {
  extractBilibiliVideoMetaFromContent,
  isBilibiliVideoArticle,
  resolveBilibiliVideoMetaInfo,
} from "../bilibiliVideoMeta";

const getVideoInfoByUrl = vi.hoisted(() => vi.fn());

vi.mock("@/utils/bilibili", () => ({
  getVideoInfoByUrl,
}));

describe("bilibiliVideoMeta", () => {
  it("应从 RSS 条目隐藏元信息中提取 B 站视频候选信息", () => {
    const meta = extractBilibiliVideoMetaFromContent(
      '<!-- tau:meta {"type":"bilibili-video","bvid":"BV1xx411c7mD","aid":"123456","cid":"654321","sourceUrl":"https://b23.tv/abc"} --><p>视频简介</p>',
    );

    expect(meta).toEqual({
      type: "bilibili-video",
      bvid: "BV1xx411c7mD",
      aid: "123456",
      cid: "654321",
      sourceUrl: "https://b23.tv/abc",
    });
  });

  it("解析视频笔记信息时应复用 B 站 URL 解析逻辑", async () => {
    getVideoInfoByUrl.mockResolvedValueOnce({
      bvid: "BV1realreal1",
      cid: "654321",
      qualityOptions: [{ value: 64 }, { value: 32 }, { value: 16 }],
    });

    await expect(
      resolveBilibiliVideoMetaInfo({
        url: "https://t.bilibili.com/987654321",
        content:
          '<!-- tau:meta {"type":"bilibili-video","aid":"123456","sourceUrl":"https://b23.tv/abc"} -->',
      }),
    ).resolves.toEqual({
      type: "bilibili",
      bvid: "BV1realreal1",
      cid: "654321",
      quality: 64,
    });

    expect(getVideoInfoByUrl).toHaveBeenCalledWith(
      "https://b23.tv/abc",
      undefined,
    );
  });

  it("应通过隐藏元信息判断动态条目是 B 站视频", () => {
    expect(
      isBilibiliVideoArticle({
        url: "https://t.bilibili.com/987654321",
        content: '<!-- tau:meta {"type":"bilibili-video","aid":"123456"} -->',
      }),
    ).toBe(true);

    expect(
      isBilibiliVideoArticle({
        url: "https://t.bilibili.com/987654321",
        content: "<p>普通动态</p>",
      }),
    ).toBe(false);
  });
});
