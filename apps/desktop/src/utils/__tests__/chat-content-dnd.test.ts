import { describe, expect, it } from "vitest";

import { getChatContentDragReference } from "../chat-content-dnd";

const reference = {
  entityType: "document-item" as const,
  entityId: 12,
  contentId: 34,
  title: "测试文档",
  previewText: "文档摘要",
};

describe("聊天内容拖拽载荷", () => {
  it("应识别卡片和文章使用的直接引用载荷", () => {
    expect(getChatContentDragReference(reference)).toEqual(reference);
  });

  it("应识别知识库和项目树载荷中的引用元数据", () => {
    expect(
      getChatContentDragReference({
        itemId: 12,
        chatContentReference: reference,
      }),
    ).toEqual(reference);
  });

  it("应拒绝缺少有效内容 ID 的载荷", () => {
    expect(
      getChatContentDragReference({
        ...reference,
        contentId: 0,
      }),
    ).toBeNull();
    expect(getChatContentDragReference({ itemId: 12 })).toBeNull();
  });
});
