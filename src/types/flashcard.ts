import type { Descendant } from "slate";

export type FlashcardType =
  | "single-choice"
  | "multiple-choice"
  | "cloze"
  | "qa"
  | "boolean";

export type FlashcardDifficulty = "foundation" | "standard" | "advanced";

export type FlashcardStatus = "new" | "learning" | "review" | "suspended";

export type FlashcardReviewRating = "easy" | "normal" | "struggle" | "hard";

export interface FlashcardOption {
  id: string;
  label: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface FlashcardBlank {
  id: string;
  placeholder: string;
  answer: string;
  alternativeAnswers?: string[];
}

export interface FlashcardData {
  options?: FlashcardOption[];
  blanks?: FlashcardBlank[];
  richContent?: Descendant[]; // 填空题的富文本内容（Slate 节点树）
  answer?: string;
  booleanAnswer?: boolean;
  explanation?: string;
  hint?: string;
  referenceNotes?: string;
}

export type FlashcardReferenceType =
  | "card"
  | "article"
  | "document"
  | "project"
  | "resource"
  | "url"
  | "note";

export interface FlashcardReference {
  id: number;
  cardId: number;
  refType: FlashcardReferenceType;
  refId?: number | null;
  refLabel: string;
  refUrl?: string | null;
  extra?: Record<string, unknown> | null;
  createTime: number;
  updateTime: number;
}

export interface FlashcardReferenceInput {
  refType: FlashcardReferenceType;
  refId?: number | null;
  refLabel: string;
  refUrl?: string | null;
  extra?: Record<string, unknown> | null;
}

export interface FlashcardDeckStats {
  totalCards: number;
  dueCount: number;
  learningCount: number;
  newCount: number;
  lastReviewedTime: number | null;
}

export interface FlashcardDeck {
  id: number;
  name: string;
  description: string;
  coverColor: string;
  emoji: string;
  sortOrder: number;
  meta: Record<string, unknown> | null;
  createTime: number;
  updateTime: number;
  stats?: FlashcardDeckStats;
}

export interface CreateFlashcardDeckInput {
  name: string;
  description?: string;
  coverColor?: string;
  emoji?: string;
  sortOrder?: number;
  meta?: Record<string, unknown> | null;
}

export interface UpdateFlashcardDeckInput
  extends Partial<CreateFlashcardDeckInput> {
  id: number;
}

export interface Flashcard {
  id: number;
  deckId: number;
  type: FlashcardType;
  prompt: string;
  detail: string;
  data: FlashcardData;
  tags: string[];
  difficulty: FlashcardDifficulty;
  reviewLevel: number;
  dueTime: number;
  lastReviewTime: number | null;
  reviewCount: number;
  easeFactor: number;
  status: FlashcardStatus;
  referenceSummary?: string | null;
  references: FlashcardReference[];
  createTime: number;
  updateTime: number;
}

export interface CreateFlashcardInput {
  deckId: number;
  type: FlashcardType;
  prompt: string;
  detail?: string;
  data: FlashcardData;
  tags?: string[];
  difficulty?: FlashcardDifficulty;
  references?: FlashcardReferenceInput[];
}

export interface UpdateFlashcardInput
  extends Partial<Omit<CreateFlashcardInput, "deckId">> {
  id: number;
  deckId?: number;
  status?: FlashcardStatus;
}

export interface FlashcardReview {
  id: number;
  cardId: number;
  deckId: number;
  rating: FlashcardReviewRating;
  reviewTime: number;
  interval: number;
  reviewLevel: number;
  easeFactor: number;
  notes?: string | null;
}

export interface FlashcardReviewPayload {
  cardId: number;
  deckId: number;
  rating: FlashcardReviewRating;
  notes?: string;
}

export interface FlashcardQueueRequest {
  deckId?: number;
  limit?: number;
  includeUpcoming?: boolean;
  statuses?: FlashcardStatus[];
}
