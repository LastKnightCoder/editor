import type {
  Flashcard,
  FlashcardData,
  FlashcardDifficulty,
  FlashcardReferenceInput,
  FlashcardType,
} from "@/types";
import { createEmptyFlashcardData, isEmptyContent, textToDescendants } from "@/utils/flashcard";
import type { Descendant } from "slate";
import { blanksOf } from "./model";

export type FormReference = FlashcardReferenceInput & { formId: string };
export const createFormReference = (reference: FlashcardReferenceInput): FormReference => ({
  ...reference,
  formId: crypto.randomUUID(),
});

export interface FormState {
  deckId: number;
  type: FlashcardType;
  prompt: Descendant[];
  detail: Descendant[];
  data: FlashcardData;
  difficulty: FlashcardDifficulty;
  tags: string[];
  references: FormReference[];
}

export function emptyForm(deckId: number, type: FlashcardType): FormState {
  return {
    deckId,
    type,
    prompt: textToDescendants(""),
    detail: textToDescendants(""),
    data: createEmptyFlashcardData(type),
    difficulty: "standard",
    tags: [],
    references: [],
  };
}

export function formFromCard(card: Flashcard): FormState {
  return {
    deckId: card.deckId,
    type: card.type,
    prompt: card.prompt,
    detail: card.detail?.length ? card.detail : textToDescendants(""),
    data: card.data ?? createEmptyFlashcardData(card.type),
    difficulty: card.difficulty,
    tags: card.tags ?? [],
    references: (card.references ?? []).map(ref =>
      createFormReference({
        refType: ref.refType,
        title: ref.title,
        contentId: ref.refType === "content" ? ref.contentId : undefined,
        customContent: ref.refType === "custom" ? ref.content?.content : undefined,
      })
    ),
  };
}

export function validate(form: FormState): string | null {
  if (isEmptyContent(form.prompt)) return "题干不能为空";
  if (form.type === "cloze" && blanksOf(form.prompt).length === 0)
    return "填空题至少需要一个填空：在题干里选中文字，用工具栏设为填空";
  if (form.type === "single-choice" || form.type === "multiple-choice") {
    const options = (form.data.options ?? []).filter(o => o.label.trim());
    if (options.length < 2) return "至少填写两个选项";
    if (!options.some(o => o.isCorrect)) return "请标记正确答案";
  }
  return null;
}
