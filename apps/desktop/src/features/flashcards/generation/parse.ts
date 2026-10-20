import type { Descendant } from "slate";
import type { GeneratedFlashcard } from "../hooks/useFlashcardGeneration";
import { textToDescendants, parseTextWithBlanks } from "@/utils/flashcard";
import { assertFlashcardDraft } from "../validateDraft";

const generateId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * 从模型输出中解析并校验闪卡草稿。
 */
export const parseFlashcardResponse = (jsonStr: string): GeneratedFlashcard[] => {
  // 模型可能在 JSON 外包裹 Markdown 围栏。
  let cleaned = jsonStr.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const startIdx = cleaned.indexOf("[");
  const endIdx = cleaned.lastIndexOf("]");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed)) {
    throw new Error("闪卡结果必须是数组");
  }

  return parsed.map(card => {
    if (!card || typeof card !== "object") throw new Error("闪卡结果格式无效");
    let promptDescendants: Descendant[];
    if (typeof card.prompt === "string") {
      if (card.type === "cloze") {
        promptDescendants = parseTextWithBlanks(card.prompt);
      } else {
        promptDescendants = textToDescendants(card.prompt);
      }
    } else {
      promptDescendants = card.prompt || textToDescendants("");
    }

    const draft = {
      id: generateId(),
      type: card.type || "qa",
      prompt: promptDescendants,
      detail:
        typeof card.detail === "string"
          ? textToDescendants(card.detail || "")
          : card.detail || textToDescendants(""),
      difficulty: card.difficulty || "standard",
      tags: card.tags || [],
      data: card.data || {},
      selected: true,
    };
    assertFlashcardDraft(draft);
    return draft;
  });
};
