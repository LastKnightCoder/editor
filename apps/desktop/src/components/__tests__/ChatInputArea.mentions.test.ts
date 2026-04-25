import { describe, expect, it } from "vitest";
import {
  extractMentionRefsFromText,
  findActiveMentionQuery,
  serializeMentionRef,
} from "@tau/shared";

describe("ChatInputArea mention markup", () => {
  it("应将 mention 引用序列化为 content-link 指令", () => {
    const markup = serializeMentionRef({
      entityType: "card",
      entityId: 42,
      contentId: 301,
      title: '测试"卡片',
      previewText: '这是"摘要',
    });

    expect(markup).toBe(
      ':content-link[测试"卡片]{refId=42 contentId=301 contentType=card title="测试&quot;卡片" previewText="这是&quot;摘要"}',
    );
  });

  it("应能从文本中提取 mention 引用列表", () => {
    const mentions = extractMentionRefsFromText(
      '请阅读 :content-link[测试卡片]{refId=42 contentId=301 contentType=card title="测试卡片" previewText="这是摘要"} 与 :content-link[测试文章]{refId=9 contentId=88 contentType=article title="测试文章" previewText="第二段摘要"}',
    );

    expect(mentions).toEqual([
      {
        entityType: "card",
        entityId: 42,
        contentId: 301,
        title: "测试卡片",
        previewText: "这是摘要",
      },
      {
        entityType: "article",
        entityId: 9,
        contentId: 88,
        title: "测试文章",
        previewText: "第二段摘要",
      },
    ]);
  });

  it("应识别光标前当前激活的 mention 查询", () => {
    expect(findActiveMentionQuery("请总结 @测", 6)).toEqual({
      query: "测",
      start: 4,
      end: 6,
    });

    expect(findActiveMentionQuery("请总结 已有文本", 8)).toBeNull();
    const text =
      ':content-link[测试卡片]{refId=42 contentId=301 contentType=card title="测试卡片"} @文';
    expect(findActiveMentionQuery(text, text.length)).toEqual({
      query: "文",
      start: text.length - 2,
      end: text.length,
    });
  });
});
