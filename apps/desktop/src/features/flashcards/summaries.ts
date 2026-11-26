import type { FlashcardsFormatContext } from "./format";
import type { Flashcard } from "@/types";

/** 题面纯文本摘要：填空显示为 ＿＿ */
export function promptSummary(card: Flashcard, { t }: Pick<FlashcardsFormatContext, "t">): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    const el = node as { type?: string; text?: string; children?: unknown[] };
    if (el.type === "flashcard-blank") parts.push("＿＿");
    else if (typeof el.text === "string") parts.push(el.text);
    else el.children?.forEach(walk);
  };
  card.prompt.forEach(walk);
  return parts.join("").trim() || t("ui.emptyPrompt");
}

/** 答案摘要（列表右侧辅助列） */
export function answerSummary(card: Flashcard, { t }: Pick<FlashcardsFormatContext, "t">): string {
  switch (card.type) {
    case "single-choice":
    case "multiple-choice":
      return (card.data.options ?? [])
        .filter(o => o.isCorrect)
        .map(o => o.label)
        .join("；");
    case "boolean":
      return (card.data.booleanAnswer ?? true) ? t("ui.true") : t("ui.false");
    case "cloze": {
      const out: string[] = [];
      const walk = (node: unknown) => {
        const el = node as { type?: string; answer?: string; children?: unknown[] };
        if (el.type === "flashcard-blank" && el.answer) out.push(el.answer);
        el.children?.forEach(walk);
      };
      card.prompt.forEach(walk);
      return out.join("；");
    }
    default:
      return card.data.answer ?? "";
  }
}
