// 就近对话的来源内容：内容页「问 AI」带入对话页的身份与选中片段。

import type { MentionRef } from "@tau/shared/chat-core";
import type { WorkspaceMessageKey } from "./workspace.messages";

export interface ContentChatTarget {
  contentId: number;
  entityType: MentionRef["entityType"];
  entityId: number;
  title: string;
  /** 选中的原文；缺省表示整篇提问 */
  quote?: string;
}

export const CONTENT_KIND_TITLE_KEYS: Record<MentionRef["entityType"], WorkspaceMessageKey> = {
  card: "content.card",
  article: "content.article",
  "project-item": "content.project-item",
  diary: "content.diary",
};
export interface ContentQuickPrompt {
  id: string;
  labelKey: WorkspaceMessageKey;
  text: string;
}
export const QUOTE_PROMPTS: readonly ContentQuickPrompt[] = [
  { id: "explain-quote", labelKey: "prompt.explainQuote", text: "解释这段" },
  { id: "summarize-quote", labelKey: "prompt.summarizeQuote", text: "总结这段" },
  { id: "translate-quote", labelKey: "prompt.translateQuote", text: "翻译成英文" },
];
export const WHOLE_PROMPTS: readonly ContentQuickPrompt[] = [
  { id: "summarize-whole", labelKey: "prompt.summarizeWhole", text: "总结这篇" },
  { id: "key-points", labelKey: "prompt.keyPoints", text: "列出要点" },
  { id: "review", labelKey: "prompt.review", text: "出几道问答题帮我复习" },
];

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
