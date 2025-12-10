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
  answer?: string;
  booleanAnswer?: boolean;
  explanation?: string;
  hint?: string;
  referenceNotes?: string;
}

export type FlashcardReferenceType = "content" | "custom";

export interface FlashcardReference {
  id: number;
  cardId: number;
  // 统一存储 contentId（来自 contents 表）
  // 对于 content 类型：引用已有内容的 contentId
  // 对于 custom 类型：新创建的 content 记录的 id
  contentId: number;
  // 引用类型：引用已有内容 或 自定义内容
  refType: FlashcardReferenceType;
  // 标题快照（用于快速显示，即使原内容被删除）
  title: string;
  createTime: number;
  updateTime: number;

  // 查询时携带的完整内容（来自 contents 表）
  // 如果内容被删除，此字段为 null
  content?: {
    id: number;
    content: Descendant[];
    createTime: number;
    updateTime: number;
    count: number;
    refCount: number;
  } | null;
}

export interface FlashcardReferenceInput {
  // 对于 content 类型：传入已有内容的 contentId
  // 对于 custom 类型：传入富文本内容，后端会创建 content 记录并返回 contentId
  refType: FlashcardReferenceType;
  contentId?: number; // content 类型时必填
  title: string;
  customContent?: Descendant[]; // custom 类型时必填
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
  prompt: Descendant[];
  detail: Descendant[];
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
  prompt: Descendant[];
  detail?: Descendant[];
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
