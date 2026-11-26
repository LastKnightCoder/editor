/**
 * 闪卡域纯函数：到期判定 / 复习队列 / 卡组统计 / 排期预估 / 作答判定 / 推荐评分。
 *
 * 排期预估与主进程 tables/flashcard.ts 的 calculateSchedule 同走
 * @tau/shared/fsrs-schedule（FSRS-6，与移动端 fsrs crate 逐值对齐）。
 */

import { type FlashcardsMessageKey } from "./i18n";
import {
  fsrsElapsedDays,
  fsrsGradeOf,
  fsrsIntervalMs,
  fsrsSchedule,
  type FsrsMemoryState,
} from "@tau/shared/fsrs-schedule";
import type { FlashcardBlankElement } from "@/editor-extensions/flashcard-blank/types";
import type { Flashcard, FlashcardReviewRating, FlashcardStatus, FlashcardType } from "@/types";
import type { Descendant } from "slate";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 按本地日历日的差（DST 切换日不用 86400000 整除） */
export function dayDiff(t: number, now: number): number {
  return Math.round((startOfDay(t) - startOfDay(now)) / DAY_MS);
}

/* ---------- 元数据 ---------- */

export const TYPE_ORDER: FlashcardType[] = [
  "qa",
  "cloze",
  "single-choice",
  "multiple-choice",
  "boolean",
];

export const TYPE_MESSAGE: Record<FlashcardType, FlashcardsMessageKey> = {
  qa: "ui.questionAndAnswer",
  cloze: "ui.cloze",
  "single-choice": "ui.singleChoice",
  "multiple-choice": "ui.multipleChoice",
  boolean: "ui.trueOrFalse",
};

export const STATUS_MESSAGE: Record<FlashcardStatus, FlashcardsMessageKey> = {
  new: "ui.new",
  learning: "ui.learning",
  review: "ui.review",
  suspended: "ui.suspended",
};

/** 评分四档：文案与统计页一致，键位 1–4 从「忘记」到「轻松」 */
export const RATINGS: {
  value: FlashcardReviewRating;
  message: FlashcardsMessageKey;
  key: string;
}[] = [
  { value: "hard", message: "ui.forgot", key: "1" },
  { value: "struggle", message: "ui.uncertain", key: "2" },
  { value: "normal", message: "ui.remembered", key: "3" },
  { value: "easy", message: "ui.easy", key: "4" },
];

export const RATING_MESSAGE: Record<FlashcardReviewRating, FlashcardsMessageKey> = {
  hard: "ui.forgot",
  struggle: "ui.uncertain",
  normal: "ui.remembered",
  easy: "ui.easy",
};

/* ---------- 排期预估 ---------- */

/** 评分后的下次间隔（毫秒），与主进程 calculateSchedule 同式（FSRS-6） */
export function nextInterval(
  card: Pick<Flashcard, "memoryStability" | "memoryDifficulty" | "lastReviewTime">,
  rating: FlashcardReviewRating,
  now: number = Date.now()
): number {
  const memory: FsrsMemoryState | null =
    card.memoryStability != null && card.memoryDifficulty != null
      ? { stability: card.memoryStability, difficulty: card.memoryDifficulty }
      : null;
  const next = fsrsSchedule(memory, fsrsElapsedDays(card.lastReviewTime, now), fsrsGradeOf(rating));
  return fsrsIntervalMs(next.intervalDays);
}

/* ---------- 到期与队列 ---------- */

/** 暂停的卡永不到期；新卡创建即到期（主进程 createFlashcard 的 due_time = 创建时刻） */
function isDue(card: Flashcard, now: number): boolean {
  return card.status !== "suspended" && card.dueTime <= now;
}

/** 复习队列：与主进程 get-review-queue 同序（due 升序、稳定性升序、新卡在前），暂停的卡不入队 */
export function reviewQueue(cards: Flashcard[], now: number, deckId?: number | null): Flashcard[] {
  return cards
    .filter(card => (deckId == null || card.deckId === deckId) && isDue(card, now))
    .sort((a, b) => a.dueTime - b.dueTime || (a.memoryStability ?? 0) - (b.memoryStability ?? 0));
}

export type DueTone = "late" | "now" | "later" | "muted";

/** 卡组视图分段：待复习 / 今天稍后 / 未来 7 天 / 更晚 / 已暂停 */
export type CardSection = "due" | "today" | "week" | "later" | "suspended";

export const SECTION_MESSAGE: Record<CardSection, FlashcardsMessageKey> = {
  due: "ui.due",
  today: "ui.laterToday",
  week: "ui.next7Days",
  later: "ui.later",
  suspended: "ui.suspended",
};

export function sectionOf(card: Flashcard, now: number): CardSection {
  if (card.status === "suspended") return "suspended";
  if (card.dueTime <= now) return "due";
  const days = dayDiff(card.dueTime, now);
  if (days === 0) return "today";
  return days < 7 ? "week" : "later";
}

/* ---------- 统计 ---------- */

export interface DeckStats {
  total: number;
  /** 现在到期（含新卡） */
  due: number;
  fresh: number;
  learning: number;
  review: number;
  suspended: number;
  /** 今天（含已到期）到未来第 6 天逐日到期数，新卡不计 */
  forecast: number[];
  laterToday: number;
  lastReviewTime: number | null;
  reviewCount: number;
}

export function deckStats(cards: Flashcard[], now: number): DeckStats {
  const stats: DeckStats = {
    total: cards.length,
    due: 0,
    fresh: 0,
    learning: 0,
    review: 0,
    suspended: 0,
    forecast: [0, 0, 0, 0, 0, 0, 0],
    laterToday: 0,
    lastReviewTime: null,
    reviewCount: 0,
  };
  for (const card of cards) {
    if (card.status === "new") stats.fresh++;
    else if (card.status === "learning") stats.learning++;
    else if (card.status === "review") stats.review++;
    else stats.suspended++;
    stats.reviewCount += card.reviewCount;
    if (card.lastReviewTime && card.lastReviewTime > (stats.lastReviewTime ?? 0))
      stats.lastReviewTime = card.lastReviewTime;
    if (card.status === "suspended") continue;
    if (card.dueTime <= now) stats.due++;
    else if (dayDiff(card.dueTime, now) === 0) stats.laterToday++;
    if (card.status === "new") continue;
    const day = Math.max(0, dayDiff(card.dueTime, now));
    if (day < 7) stats.forecast[day]++;
  }
  return stats;
}

/** 预计耗时（分钟）：到期卡每张 20 秒、新卡 40 秒，只作提示 */
export function estimateMinutes(cards: Flashcard[]): number {
  const seconds = cards.reduce((sum, card) => sum + (card.status === "new" ? 40 : 20), 0);
  return Math.max(1, Math.round(seconds / 60));
}

/** 暂停后恢复的状态：新卡为 new，已学卡按稳定性（≥1 天间隔为巩固，同主进程评分规则） */
export function resumedStatus(card: Flashcard): FlashcardStatus {
  if (card.reviewCount === 0 || card.memoryStability == null) return "new";
  return card.memoryStability >= 1 ? "review" : "learning";
}

/* ---------- 作答 ---------- */

export function blanksOf(content: Descendant[]): FlashcardBlankElement[] {
  const out: FlashcardBlankElement[] = [];
  const walk = (node: unknown) => {
    const el = node as { type?: string; children?: unknown[] };
    if (el.type === "flashcard-blank") out.push(el as unknown as FlashcardBlankElement);
    el.children?.forEach(walk);
  };
  content.forEach(walk);
  return out;
}

const normalize = (text: string) => text.trim().toLowerCase();

export function blankCorrect(blank: FlashcardBlankElement, input: string): boolean {
  const value = normalize(input);
  return [blank.answer, ...(blank.alternativeAnswers ?? [])].some(a => normalize(a) === value);
}

export interface ReviewAnswer {
  single?: string;
  multi?: string[];
  bool?: boolean;
  cloze?: Record<string, string>;
  qa?: string;
}

/** 客观题判对错；问答题无标准判定，返回 null */
export function judgeAnswer(card: Flashcard, answer: ReviewAnswer): boolean | null {
  const options = card.data.options ?? [];
  switch (card.type) {
    case "single-choice":
      return options.find(o => o.isCorrect)?.id === answer.single;
    case "multiple-choice": {
      const want = options.filter(o => o.isCorrect).map(o => o.id);
      const got = answer.multi ?? [];
      return want.length === got.length && want.every(id => got.includes(id));
    }
    case "boolean":
      return answer.bool === (card.data.booleanAnswer ?? true);
    case "cloze":
      return blanksOf(card.prompt).every(b => blankCorrect(b, answer.cloze?.[b.blankId] ?? ""));
    default:
      return null;
  }
}

/** 推荐评分：客观题按对错（错 → 忘记、对 → 记得）；问答题按 AI 评分（未评判则不推荐） */
export function suggestRating(
  card: Flashcard,
  correct: boolean | null,
  aiScore: number | null
): FlashcardReviewRating | null {
  if (card.type === "qa") return aiScore == null ? null : scoreToRating(aiScore);
  if (correct == null) return null;
  return correct ? "normal" : "hard";
}

/** AI 评分（1–10）→ 评分档：≥9 轻松 / ≥6 记得 / ≥4 模糊 / 其余忘记 */
export function scoreToRating(score: number): FlashcardReviewRating {
  if (score >= 9) return "easy";
  if (score >= 6) return "normal";
  if (score >= 4) return "struggle";
  return "hard";
}

/** 评分前的排期快照（撤销评分时回写） */
export function scheduleSnapshot(card: Flashcard) {
  return {
    memoryStability: card.memoryStability,
    memoryDifficulty: card.memoryDifficulty,
    dueTime: card.dueTime,
    lastReviewTime: card.lastReviewTime,
    reviewCount: card.reviewCount,
    status: card.status,
  };
}

/** 选即提交的题型（单选 / 判断）：作答前没有提交按钮，键位提示独占操作区一行 */
export function submitsOnPick(card: Flashcard): boolean {
  return card.type === "single-choice" || card.type === "boolean";
}

export const TYPE_META = {
  "single-choice": {
    labelKey: "ui.singleChoiceQuestion",
    descriptionKey: "ui.setOneCorrectAnswerAndDistractors",
  },
  "multiple-choice": {
    labelKey: "ui.multipleChoiceQuestion",
    descriptionKey: "ui.setMultipleCorrectAnswersForRelatedConcepts",
  },
  cloze: { labelKey: "ui.clozeQuestion", descriptionKey: "type.clozeDescription" },
  qa: {
    labelKey: "ui.freeResponse",
    descriptionKey: "type.qaDescription",
  },
  boolean: {
    labelKey: "ui.trueOrFalseQuestion",
    descriptionKey: "type.booleanDescription",
  },
} as const;
