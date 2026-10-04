import { describe, expect, it } from "vitest";
import type { CardListItem } from "../../../types";
import { mapCardItemToContentLinkResult } from "../editorExtensions/ContentLinkPickerSheet";

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

  it("摘要为空时应回退到内容编号文案", () => {
    const item = createCardItem({
      id: 88,
      contentId: 8801,
      excerpt: "   ",
    });

    const result = mapCardItemToContentLinkResult(item);
    expect(result.displayText).toBe("内容 #88");
    expect(result.contentTitle).toBe("内容 #88");
  });
});
