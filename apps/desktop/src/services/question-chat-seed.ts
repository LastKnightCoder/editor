/**
 * 围绕问题发起对话（Q6）：新对话的首条消息带上问题的标题、背景与材料清单（只列标题与出处，
 * 全文由 AI 按需检索）；对话登记后挂成问题的探究对话，并记谱系 discussed_in（问题 → 对话，KL-007）。
 */

import { getQuestionDetail, linkQuestionChat } from "@/commands/question";
import { recordLineage } from "@/commands/lineage";
import { slatePlainText } from "@/entity/inline-refs";
import type { MessageContentItem } from "@tau/shared";
import type { QuestionDetail } from "@/types";

const LABEL: Record<string, string> = {
  card: "卡片",
  article: "文章",
  project_item: "项目文档",
  project: "项目",
  white_board: "白板",
  answer: "我的答案",
  excerpt: "划线",
  "pdf-annotation": "PDF 标注",
  "web-clip": "剪藏",
};

const MAX_MATERIALS = 30;
const MAX_BACKGROUND = 600;

/** 首条消息前置的上下文（Markdown 引用块，用户在气泡里也能看到带了什么） */
export function questionSeedText(detail: Pick<QuestionDetail, "question" | "materials">): string {
  const { question, materials } = detail;
  const background = slatePlainText(question.description ?? [])
    .replace(/\s+/g, " ")
    .trim();
  const live = materials.filter(m => !m.missing);
  const lines = [
    `围绕问题：${question.questionContent}`,
    background ? `背景：${background.slice(0, MAX_BACKGROUND)}` : "",
    live.length ? "已有材料：" : "",
    ...live
      .slice(0, MAX_MATERIALS)
      .map(m => `- ${LABEL[m.targetType] ?? "材料"} · ${m.title}${m.meta ? `（${m.meta}）` : ""}`),
    live.length > MAX_MATERIALS ? `- …另有 ${live.length - MAX_MATERIALS} 份` : "",
  ].filter(Boolean);
  return lines.map(line => `> ${line}`).join("\n");
}

export function applyQuestionSeed(
  content: MessageContentItem[],
  seedText: string
): MessageContentItem[] {
  const index = content.findIndex(item => item.type === "text");
  const next = [...content];
  if (index >= 0) {
    const item = next[index] as Extract<MessageContentItem, { type: "text" }>;
    next[index] = { ...item, text: `${seedText}\n\n${item.text}` };
  } else {
    next.unshift({ type: "text", text: seedText });
  }
  return next;
}

export const loadQuestionSeed = (questionId: number) => getQuestionDetail(questionId);

/** 对话登记后：挂成探究对话并记发起来源 */
export async function linkSeededChat(questionId: number, sessionId: string): Promise<void> {
  await linkQuestionChat(questionId, { sessionId }, { mutationSource: "question-chat-seed" });
  await recordLineage({
    src: { kind: "question", id: questionId },
    dst: { kind: "chat-session", id: sessionId },
    relation: "discussed_in",
  });
}
