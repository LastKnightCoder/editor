// 就近对话的来源内容：内容页「问 AI」带入对话页的身份与选中片段。

import type { MentionRef } from "@tau/shared/chat-core";

export interface ContentChatTarget {
  contentId: number;
  entityType: MentionRef["entityType"];
  entityId: number;
  title: string;
  /** 选中的原文；缺省表示整篇提问 */
  quote?: string;
}

export const CONTENT_KIND_TITLE: Record<MentionRef["entityType"], string> = {
  card: "关于这张卡片",
  article: "关于这篇文章",
  "project-item": "关于这篇文档",
  diary: "关于这篇日记",
};

export const QUOTE_PROMPTS = ["解释这段", "总结这段", "翻译成英文"];
export const WHOLE_PROMPTS = ["总结这篇", "列出要点", "出几道问答题帮我复习"];

export function mentionOf(target: ContentChatTarget): MentionRef {
  return {
    entityType: target.entityType,
    entityId: target.entityId,
    contentId: target.contentId,
    title: target.title,
    previewText: target.quote ?? "",
    ...(target.quote ? { quote: true } : {}),
  };
}
