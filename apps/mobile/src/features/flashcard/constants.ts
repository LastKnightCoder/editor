// 闪卡常量：题型元数据、评分档位、卡组调色板、调度间隔预览。
// 预览与 Rust 侧 flashcard_schedule.rs 的 fsrs 调度同式，经 @tau/shared/fsrs-schedule 对齐
// （仅用于评分按钮上的「下次间隔」文案，权威调度在 Rust 侧事务内计算）。

import { type FlashcardMessageKey } from "./i18n";
import type { FlashcardFormatContext } from "./format";
import {
  fsrsElapsedDays,
  fsrsGradeOf,
  fsrsSchedule,
  type FsrsMemoryState,
} from "@tau/shared/fsrs-schedule";
import type {
  FlashcardDifficulty,
  FlashcardReviewRating,
  FlashcardStatus,
  FlashcardType,
} from "./types";

export const FLASHCARD_TYPE_META: Record<
  FlashcardType,
  { labelKey: FlashcardMessageKey; descriptionKey: FlashcardMessageKey }
> = {
  "single-choice": {
    labelKey: "ui.singleChoiceQuestion",
    descriptionKey: "ui.setOneCorrectAnswerAndDistractors",
  },
  "multiple-choice": {
    labelKey: "ui.multipleChoiceQuestion",
    descriptionKey: "ui.setMultipleCorrectAnswersForRelatedConcepts",
  },
  cloze: { labelKey: "ui.clozeQuestion", descriptionKey: "ui.addBlanksToRecallSpecificDetails" },
  qa: {
    labelKey: "ui.freeResponse",
    descriptionKey: "ui.answerFreelyToPracticeRecallAndExpression",
  },
  boolean: {
    labelKey: "ui.trueOrFalseQuestion",
    descriptionKey: "ui.quicklyJudgeWhetherAStatementIsTrue",
  },
};

export const FLASHCARD_TYPE_ORDER: FlashcardType[] = [
  "single-choice",
  "multiple-choice",
  "cloze",
  "qa",
  "boolean",
];

/** 题型语义色与图标（选题瓷贴、编辑页题型徽标共用） */
export const FLASHCARD_TYPE_TONE: Record<
  FlashcardType,
  { soft: string; color: string; icon: string }
> = {
  "single-choice": { soft: "var(--tau-accent-soft)", color: "var(--tau-accent)", icon: "◉" },
  "multiple-choice": { soft: "var(--tau-tag-1-soft)", color: "var(--tau-tag-1)", icon: "⊕" },
  cloze: { soft: "var(--tau-tag-3-soft)", color: "var(--tau-tag-3)", icon: "▭" },
  qa: { soft: "var(--tau-tag-2-soft)", color: "var(--tau-tag-2)", icon: "✎" },
  boolean: { soft: "var(--tau-tag-4-soft)", color: "var(--tau-tag-4)", icon: "✓" },
};

export const FLASHCARD_STATUS_MESSAGE: Record<FlashcardStatus, FlashcardMessageKey> = {
  new: "ui.new",
  learning: "ui.learning",
  review: "ui.review",
  suspended: "ui.suspended2",
};

export const FLASHCARD_DIFFICULTY_MESSAGE: Record<FlashcardDifficulty, FlashcardMessageKey> = {
  foundation: "ui.foundation",
  standard: "ui.standard2",
  advanced: "ui.advanced",
};

/** 四档评分：语义色对齐移动端令牌（rose/butter/sky/sage），顺序由难到易 */
export const REVIEW_RATINGS: Array<{
  value: FlashcardReviewRating;
  message: FlashcardMessageKey;
  color: string;
}> = [
  { value: "hard", message: "ui.hard", color: "var(--tau-tag-5)" },
  { value: "struggle", message: "ui.fair", color: "var(--tau-tag-4)" },
  { value: "normal", message: "ui.good", color: "var(--tau-tag-2)" },
  { value: "easy", message: "ui.easy", color: "var(--tau-tag-1)" },
];

/** 评分按钮上的「下次间隔」预览：与 Rust flashcard_schedule.rs（fsrs crate）同式，
 *  经 @tau/shared/fsrs-schedule 对齐（权威调度在 Rust 侧事务内计算）。 */
export function nextIntervalPreview(
  card: {
    memoryStability: number | null;
    memoryDifficulty: number | null;
    lastReviewTime: number | null;
  },
  rating: FlashcardReviewRating,
  { locale, t }: FlashcardFormatContext
): string {
  const memory: FsrsMemoryState | null =
    card.memoryStability != null && card.memoryDifficulty != null
      ? { stability: card.memoryStability, difficulty: card.memoryDifficulty }
      : null;
  const next = fsrsSchedule(
    memory,
    fsrsElapsedDays(card.lastReviewTime, Date.now()),
    fsrsGradeOf(rating)
  );
  const minutes = next.intervalDays * 24 * 60;
  if (minutes < 60)
    return t("interval.minutes", {
      count: Math.max(1, Math.round(minutes)),
      amount: Math.max(1, Math.round(minutes)).toLocaleString(locale),
    });
  if (minutes < 24 * 60)
    return t("interval.hours", {
      count: Math.round(minutes / 60),
      amount: Math.round(minutes / 60).toLocaleString(locale),
    });
  const days = minutes / (24 * 60);
  return t("interval.days", {
    count: days >= 10 ? Math.round(days) : Math.round(days * 10) / 10,
    amount: (days >= 10 ? Math.round(days) : Math.round(days * 10) / 10).toLocaleString(locale),
  });
}

/** 移动端新建卡组调色板：主题语义色系（存储仍为 hex，桌面端色值照常兼容显示） */
export const DECK_COLORS = [
  "#d97757",
  "#61795f",
  "#5c7d99",
  "#8a7aa6",
  "#a38c4d",
  "#b06a5e",
  "#b2794b",
  "#4a4136",
];

/** 到期时间的展示文案（列表行用） */
export function formatDueTime(dueTime: number, { locale, t }: FlashcardFormatContext): string {
  const diff = dueTime - Date.now();
  if (diff <= 0) return t("due.now");
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("due.soon");
  if (minutes < 60)
    return t("interval.minutes", { count: minutes, amount: minutes.toLocaleString(locale) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return t("interval.hours", { count: hours, amount: hours.toLocaleString(locale) });
  return t("interval.days", {
    count: Math.floor(hours / 24),
    amount: Math.floor(hours / 24).toLocaleString(locale),
  });
}
