import type { FlashcardReviewRating } from "@/types";

export const RATING_BG: Record<FlashcardReviewRating, string> = {
  hard: "bg-danger",
  struggle: "bg-warn",
  normal: "bg-ok",
  easy: "bg-info",
};

export const LETTERS = "ABCDEF";

export type Dist = Record<FlashcardReviewRating, number>;
export const EMPTY_DIST: Dist = { hard: 0, struggle: 0, normal: 0, easy: 0 };

export const RATING_TEXT: Record<FlashcardReviewRating, string> = {
  hard: "text-danger",
  struggle: "text-warn",
  normal: "text-ok",
  easy: "text-info",
};
export const RATING_HOVER: Record<FlashcardReviewRating, string> = {
  hard: "hover:bg-danger-soft",
  struggle: "hover:bg-warn-soft",
  normal: "hover:bg-ok-soft",
  easy: "hover:bg-info-soft",
};
export const RATING_RING: Record<FlashcardReviewRating, string> = {
  hard: "ring-danger",
  struggle: "ring-warn",
  normal: "ring-ok",
  easy: "ring-info",
};
