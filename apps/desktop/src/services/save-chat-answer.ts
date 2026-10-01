/**
 * AI 回答「存为卡片 / 文章」：把回答的最终文本复制成新正文（回答在会话 JSONL 里，不在 contents），
 * 并记谱系 saved_from（对话 → 新实体，位置为这条回答的消息 id）。
 */

import { createArticle } from "@/commands/article";
import { createCard } from "@/commands/card";
import { recordLineage } from "@/commands/lineage";
import type { EntityRef } from "@/entity/ref";
import { ECardCategory } from "@/types/card";
import { getContentLength } from "@/utils/helper";
import { importFromMarkdown } from "@/utils/markdown";
import { defaultArticleEventBus, defaultCardEventBus } from "@/utils";

export interface ChatAnswerSource {
  /** chat_session.id（= pi 会话 id） */
  sessionId: string;
  /** 这条回答对应的 pi entry id */
  messageIds: string[];
  chatTitle: string;
}

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/m;

/** 文章标题：回答里的第一个标题，没有则用对话标题 */
export function answerArticleTitle(markdown: string, chatTitle: string): string {
  const heading = markdown.match(HEADING)?.[1]?.trim();
  return heading || chatTitle.trim() || "对话摘录";
}

export async function saveChatAnswer(
  target: "card" | "article",
  markdown: string,
  source: ChatAnswerSource
): Promise<EntityRef> {
  const content = importFromMarkdown(markdown);
  const count = getContentLength(content);
  let ref: EntityRef;
  if (target === "card") {
    const card = await createCard({
      content,
      tags: [],
      links: [],
      category: ECardCategory.Temporary,
      count,
      isTop: false,
    });
    defaultCardEventBus.createEditor().publishCardEvent("card:created", card);
    ref = { kind: "card", id: card.id };
  } else {
    const article = await createArticle({
      title: answerArticleTitle(markdown, source.chatTitle),
      content,
      bannerBg: "",
      bannerPosition: "center",
      isTop: false,
      author: "",
      links: [],
      tags: [],
      isDelete: false,
      count,
    });
    defaultArticleEventBus.createEditor().publishArticleEvent("article:created", article);
    ref = { kind: "article", id: article.id };
  }
  await recordLineage({
    src: { kind: "chat-session", id: source.sessionId },
    dst: ref,
    relation: "saved_from",
    srcAnchor: { messageIds: source.messageIds },
  });
  return ref;
}
