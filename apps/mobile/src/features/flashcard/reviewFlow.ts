// 复习判分与填空提取的纯函数（移植自桌面 ReviewModal 的 checkAnswer /
// extractBlanksFromContent，独立成模块便于单测）。调度写库在 Rust 侧，这里只判对错。

import type { Flashcard } from "./types";

/** 填空元素（嵌在 prompt 富文本里的行内节点） */
export interface BlankNode {
  blankId: string;
  answer: string;
  placeholder: string;
  alternativeAnswers?: string[];
}

/** 用户的逐题型作答 */
export interface ReviewAnswer {
  singleChoice?: string;
  multipleChoice?: string[];
  cloze?: Record<string, string>;
  qa?: string;
  boolean?: boolean;
}

/** 从 Slate JSON 递归提取 flashcard-blank 行内元素 */
export function extractBlanks(prompt: unknown[]): BlankNode[] {
  const blanks: BlankNode[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.type === "flashcard-blank" && typeof record.blankId === "string") {
      blanks.push({
        blankId: record.blankId,
        answer: typeof record.answer === "string" ? record.answer : "",
        placeholder: typeof record.placeholder === "string" ? record.placeholder : "",
        alternativeAnswers: Array.isArray(record.alternativeAnswers)
          ? (record.alternativeAnswers as string[])
          : undefined,
      });
      return;
    }
    if (Array.isArray(record.children)) {
      record.children.forEach(walk);
    }
  };
  prompt.forEach(walk);
  return blanks;
}

const normalize = (text: string | undefined): string => (text ?? "").trim().toLowerCase();

/** 单个填空的判定（供整体判分与背面逐空高亮共用） */
export function isBlankCorrect(blank: BlankNode, userValue: string | undefined): boolean {
  const user = normalize(userValue);
  if (!user) return false;
  if (user === normalize(blank.answer)) return true;
  return (blank.alternativeAnswers ?? []).some(alt => normalize(alt) === user);
}

function checkCloze(card: Flashcard, answer: ReviewAnswer): boolean {
  const blanks = extractBlanks(card.prompt);
  if (blanks.length === 0) return true;
  return blanks.every(blank => isBlankCorrect(blank, answer.cloze?.[blank.blankId]));
}

/** 判分：问答题恒 true（自评）；多选题要求集合完全一致 */
export function checkAnswer(card: Flashcard, answer: ReviewAnswer): boolean {
  switch (card.type) {
    case "single-choice": {
      const correct = card.data.options?.find(option => option.isCorrect);
      return !!correct && answer.singleChoice === correct.id;
    }
    case "multiple-choice": {
      const correctIds = new Set((card.data.options ?? []).filter(o => o.isCorrect).map(o => o.id));
      const userIds = new Set(answer.multipleChoice ?? []);
      return correctIds.size === userIds.size && [...correctIds].every(id => userIds.has(id));
    }
    case "cloze":
      return checkCloze(card, answer);
    case "boolean":
      return answer.boolean === card.data.booleanAnswer;
    case "qa":
      return true;
    default:
      return false;
  }
}

/**
 * 该题型在当前作答下能否提交。与桌面不同：问答允许空答直接翻面自评（桌面要求非空），
 * 填空要求全部空填完（桌面填任一空即可交）——移动端取更严格的一档，减少误提交。
 */
export function canSubmitAnswer(card: Flashcard, answer: ReviewAnswer): boolean {
  switch (card.type) {
    case "single-choice":
      return !!answer.singleChoice;
    case "multiple-choice":
      return (answer.multipleChoice?.length ?? 0) > 0;
    case "cloze":
      return extractBlanks(card.prompt).every(blank => !!answer.cloze?.[blank.blankId]?.trim());
    case "boolean":
      return answer.boolean !== undefined;
    case "qa":
      return true;
    default:
      return false;
  }
}
