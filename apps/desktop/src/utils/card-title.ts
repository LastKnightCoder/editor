import type { ICard } from "@/types";
import { getEditorText } from "./editor";

/**
 * 卡片标题（KL-056）：AI 标题优先，没有时（没配模型、还没处理到、生成失败）取正文前 fallbackLength 字。
 * 只用于「当作卡片标题」的地方；摘要、预览文字仍直接取正文。
 */
export function cardTitle(card: Pick<ICard, "content" | "aiTitle">, fallbackLength = 20): string {
  return card.aiTitle?.trim() || getEditorText(card.content, fallbackLength);
}
