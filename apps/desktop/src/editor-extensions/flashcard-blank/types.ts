import type { Descendant } from "slate";

export interface FlashcardBlankElement {
  type: "flashcard-blank";
  blankId: string;
  placeholder: string;
  answer: string;
  alternativeAnswers?: string[];
  uuid: string;
  children: Descendant[];
}
