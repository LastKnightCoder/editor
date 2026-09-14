// 闪卡领域类型：与桌面端 apps/desktop/src/types/flashcard.ts 及 Rust 侧
// flashcard_types.rs（serde camelCase）保持一致。prompt/detail 为 Slate JSON，
// 由 RichRenderer 渲染，判分逻辑见 reviewFlow.ts。

export type FlashcardType = "single-choice" | "multiple-choice" | "cloze" | "qa" | "boolean";

export type FlashcardDifficulty = "foundation" | "standard" | "advanced";

export type FlashcardStatus = "new" | "learning" | "review" | "suspended";

export type FlashcardReviewRating = "easy" | "normal" | "struggle" | "hard";

export interface FlashcardOption {
  id: string;
  label: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface FlashcardData {
  options?: FlashcardOption[];
  blanks?: { id: string; placeholder: string; answer: string; alternativeAnswers?: string[] }[];
  answer?: string;
  booleanAnswer?: boolean;
  explanation?: string;
  hint?: string;
  referenceNotes?: string;
}

export interface FlashcardDeckStats {
  totalCards: number;
  dueCards: number;
  newCards: number;
  learningCards: number;
  lastReviewedTime: number | null;
}

export interface FlashcardDeck {
  id: number;
  name: string;
  description: string;
  coverColor: string;
  emoji: string;
  sortOrder: number;
  meta: unknown;
  createTime: number;
  updateTime: number;
  stats?: FlashcardDeckStats;
}

export interface FlashcardReferenceContent {
  id: number;
  content: unknown[];
  createTime: number;
  updateTime: number;
  count: number;
  refCount: number;
}

export interface FlashcardReference {
  id: number;
  cardId: number;
  contentId: number;
  refType: "content" | "custom";
  title: string;
  createTime: number;
  updateTime: number;
  content?: FlashcardReferenceContent | null;
}

/** 单日复习统计（dayStart 由前端按本地时区计算） */
export interface FlashcardReviewDayStats {
  dayStart: number;
  count: number;
  easy: number;
  normal: number;
  struggle: number;
  hard: number;
}

export interface Flashcard {
  id: number;
  deckId: number;
  type: FlashcardType;
  prompt: unknown[];
  detail: unknown[];
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
