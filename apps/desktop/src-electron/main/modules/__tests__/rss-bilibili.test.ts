import { describe, expect, it } from "vitest";
import {
  BILIBILI_FOLLOWINGS_DYNAMIC_URL,
  __rssBilibiliInternals,
  buildBilibiliUserVideoUrl,
  parseBilibiliSpaceUrl,
  parseLocalBilibiliFeedUrl,
} from "../rss-bilibili";

describe("rss-bilibili", () => {
  it("应识别 B 站空间链接中的 UID", () => {
    expect(parseBilibiliSpaceUrl("https://space.bilibili.com/2267573")).toBe(
      "2267573",
    );
    expect(
      parseBilibiliSpaceUrl(
        "https://space.bilibili.com/2267573/dynamic?spm_id_from=333",
      ),
    ).toBe("2267573");
    expect(parseBilibiliSpaceUrl("https://www.bilibili.com/video/BV1")).toBe(
      null,
    );
  });

  it("应解析本地 B 站 Feed URL", () => {
    expect(
      parseLocalBilibiliFeedUrl(buildBilibiliUserVideoUrl("2267573")),
    ).toEqual({
      type: "user-video",
      uid: "2267573",
    });
    expect(parseLocalBilibiliFeedUrl(BILIBILI_FOLLOWINGS_DYNAMIC_URL)).toEqual({
      type: "followings-dynamic",
    });
    expect(parseLocalBilibiliFeedUrl("https://example.com/feed.xml")).toBe(
      null,
    );
  });

  it("非法 UID 应给出明确错误", () => {
    expect(() =>
      parseLocalBilibiliFeedUrl("tau://rss/bilibili/user-video/not-a-uid"),
    ).toThrow("UID 不正确");
  });

  it("关注动态中的视频应优先跳转到视频播放页", () => {
    const entry = __rssBilibiliInternals.mapFollowingDynamicItem({
      desc: {
        dynamic_id_str: "987654321",
        timestamp: 1760000000,
        user_profile: { info: { uname: "kate人不错" } },
      },
      card: JSON.stringify({
        title: "MiniMax M3 真实项目实测",
        bvid: "BV1xx411c7mD",
        dynamic_id_str: "987654321",
        desc: "视频简介",
        pic: "https://i0.hdslb.com/test.jpg",
      }),
    });

    expect(entry?.link).toBe("https://www.bilibili.com/video/BV1xx411c7mD");
  });

  it("关注动态中的短 BV 号应回退到 av 播放页并写入视频元信息", () => {
    const entry = __rssBilibiliInternals.mapFollowingDynamicItem({
      desc: {
        type: 8,
        dynamic_id_str: "987654321",
        rid: 123456,
        timestamp: 1760000000,
        user_profile: { info: { uname: "kate人不错" } },
      },
      card: JSON.stringify({
        title: "MiniMax M3 真实项目实测",
        bvid: "BV1Saje5e",
        aid: 123456,
        cid: 654321,
        dynamic_id_str: "987654321",
        desc: "视频简介",
      }),
    });

    expect(entry?.link).toBe("https://www.bilibili.com/video/av123456");
    expect(entry?.contentHtml).toContain('"type":"bilibili-video"');
    expect(entry?.contentHtml).toContain('"aid":"123456"');
    expect(entry?.contentHtml).toContain('"cid":"654321"');
    expect(entry?.contentHtml).toContain('"bvid":null');
  });

  it("关注动态中的官方短链应优先作为视频解析入口", () => {
    const entry = __rssBilibiliInternals.mapFollowingDynamicItem({
      desc: {
        type: 8,
        dynamic_id_str: "987654321",
        rid: 123456,
        timestamp: 1760000000,
        user_profile: { info: { uname: "kate人不错" } },
      },
      card: JSON.stringify({
        title: "MiniMax M3 真实项目实测",
        bvid: "BV1Saje5e",
        aid: 123456,
        short_link_v2: "https://b23.tv/abc",
        dynamic_id_str: "987654321",
        desc: "视频简介",
      }),
    });

    expect(entry?.link).toBe("https://b23.tv/abc");
    expect(entry?.contentHtml).toContain('"sourceUrl":"https://b23.tv/abc"');
  });

  it("关注动态中的 Bilibili 客户端深链应转换为 Web 链接", () => {
    const videoEntry = __rssBilibiliInternals.mapFollowingDynamicItem({
      desc: {
        type: 8,
        dynamic_id_str: "987654321",
        timestamp: 1760000000,
        user_profile: { info: { uname: "kate人不错" } },
      },
      card: JSON.stringify({
        title: "视频动态",
        short_link_v2: "bilibili://video/123456",
        desc: "视频简介",
      }),
    });
    const dynamicEntry = __rssBilibiliInternals.mapFollowingDynamicItem({
      desc: {
        type: 2,
        dynamic_id_str: "987654321",
        timestamp: 1760000000,
        user_profile: { info: { uname: "kate人不错" } },
      },
      card: JSON.stringify({
        item: {
          dynamic: "图文动态",
          jump_url: "bilibili://dynamic/987654321",
        },
      }),
    });

    expect(videoEntry?.link).toBe("https://www.bilibili.com/video/av123456");
    expect(videoEntry?.contentHtml).not.toContain("bilibili://");
    expect(dynamicEntry?.link).toBe("https://t.bilibili.com/987654321");
  });

  it("图文动态不应把整段正文作为标题和正文", () => {
    const longText =
      "报！阿B 联动肯德基车速取 请大会员们吃肯德基！还有机会抽免单，领新款 PS5！".repeat(
        8,
      );
    const entry = __rssBilibiliInternals.mapFollowingDynamicItem({
      desc: {
        type: 2,
        dynamic_id_str: "123456789",
        timestamp: 1760000000,
        user_profile: { info: { uname: "哔哩哔哩大会员" } },
      },
      card: JSON.stringify({
        item: {
          dynamic: longText,
          pictures: [{ img_src: "https://i0.hdslb.com/picture.jpg" }],
        },
      }),
    });

    expect(entry?.title).toBe("哔哩哔哩大会员的图文动态");
    expect(entry?.description?.length).toBeLessThanOrEqual(123);
    expect(entry?.contentHtml).toContain("...");
    expect(entry?.contentHtml).toContain("<img");
    expect(entry?.link).toBe("https://t.bilibili.com/123456789");
  });
});
