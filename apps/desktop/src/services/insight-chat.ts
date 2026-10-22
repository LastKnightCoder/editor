/**
 * 洞见「聊一聊」：把这条发现和相关笔记带进停靠栏的新对话，预填提问与引用，由用户发送。
 * 用户发出后返回 true（调用方据此标为已处理），没发送就关掉返回 false。
 */

import { toast } from "@tau/ui";
import type { MentionEntityType, MentionRef } from "@tau/shared";
import type { EntityRef } from "@/entity/ref";
import { startChat } from "@/features/chat/chatStart";

/** 对话引用只支持卡片、文章、项目文档 */
const MENTION_TYPES: Partial<Record<EntityRef["kind"], MentionEntityType>> = {
  card: "card",
  article: "article",
  "project-item": "project-item",
};

export interface InsightNote {
  ref: EntityRef;
  contentId: number;
  title: string;
}

export async function discussInsight(prompt: string, notes: InsightNote[]): Promise<boolean> {
  const seen = new Set<number>();
  const mentions: MentionRef[] = notes.flatMap(note => {
    const entityType = MENTION_TYPES[note.ref.kind];
    if (!entityType || seen.has(note.contentId)) return [];
    seen.add(note.contentId);
    return [
      {
        entityType,
        entityId: note.ref.id,
        contentId: note.contentId,
        title: note.title,
        previewText: "",
      },
    ];
  });
  try {
    const sessionId = await startChat(
      { placement: "dock", prompt, mentions },
      new AbortController().signal
    );
    return sessionId !== null;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "发起对话失败");
    return false;
  }
}
