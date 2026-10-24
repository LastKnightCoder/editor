import { describe, expect, it } from "vitest";
import type { CardListItem } from "../../../types";
import {
  mapCardItemToContentLinkResult,
  mapSearchResultToContentLinkResult,
} from "../editorExtensions/ContentLinkPickerSheet";

function createCardItem(partial?: Partial<CardListItem>): CardListItem {
  return {
    id: 12,
    contentId: 1201,
    updateTime: 1_736_000_000_000,
    tags: [],
    excerpt: "第一行摘要\n第二行",
    content: [],
    ...(partial ?? {}),
  };
}

describe("contentLink picker mapping", () => {
  it("应使用 contentId 作为关联目标，refId 保留卡片 id", () => {
    const item = createCardItem({
      id: 55,
      contentId: 9901,
      excerpt: "用于测试的摘要",
    });

    const result = mapCardItemToContentLinkResult(item);

    expect(result.contentId).toBe(9901);
    expect(result.refId).toBe(55);
    expect(result.contentType).toBe("card");
    expect(result.displayText).toBe("用于测试的摘要");
  });

  it("摘要为空时应回退到卡片编号文案", () => {
    const item = createCardItem({
      id: 88,
      contentId: 8801,
      excerpt: "   ",
    });

    const result = mapCardItemToContentLinkResult(item);
    expect(result.displayText).toBe("卡片 #88");
    expect(result.contentTitle).toBe("卡片 #88");
  });

  it("统一搜索结果按类型引用，标题为空时回退到摘要首行", () => {
    const base = {
      id: 7,
      score: 1,
      date: null,
      containerId: null,
      containerTitle: null,
      updateTime: 1_736_000_000_000,
    };
    expect(
      mapSearchResultToContentLinkResult({
        ...base,
        type: "article",
        title: "检索练习的实验证据",
        excerpt: "",
        contentId: 701,
      })
    ).toEqual({
      contentId: 701,
      contentType: "article",
      contentTitle: "检索练习的实验证据",
      refId: 7,
      displayText: "检索练习的实验证据",
    });
    expect(
      mapSearchResultToContentLinkResult({
        ...base,
        type: "card",
        title: " ",
        excerpt: "摘要首行\n第二行",
        contentId: 702,
      })?.displayText
    ).toBe("摘要首行");
  });

  it("没有 contentId 的结果（如日记）不能被引用", () => {
    expect(
      mapSearchResultToContentLinkResult({
        id: 3,
        type: "diary-daily",
        title: "10月24日",
        excerpt: "",
        contentId: null,
        updateTime: 0,
        score: 1,
        date: "2026-10-24",
        containerId: null,
        containerTitle: null,
      })
    ).toBeNull();
  });
});
