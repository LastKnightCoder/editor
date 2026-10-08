// 闪卡常量：题型元数据、评分档位、卡组调色板、调度间隔预览。
// 预览与 Rust 侧 flashcard_schedule.rs 的 fsrs 调度同式，经 @tau/shared/fsrs-schedule 对齐
// （仅用于评分按钮上的「下次间隔」文案，权威调度在 Rust 侧事务内计算）。

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

export const FLASHCARD_TYPE_META: Record<FlashcardType, { label: string; description: string }> = {
  "single-choice": { label: "单选题", description: "设置一个正确答案，其余为干扰项" },
  "multiple-choice": { label: "多选题", description: "支持多个正确答案，适合概念组合记忆" },
  cloze: { label: "填空题", description: "题干中挖空作答，考察知识细节" },
  qa: { label: "问答题", description: "自由作答，适合总结与表述" },
  boolean: { label: "判断题", description: "快速判断概念正误" },
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
  "single-choice": { soft: "var(--apricot-soft)", color: "var(--apricot)", icon: "◉" },
  "multiple-choice": { soft: "var(--sage-soft)", color: "var(--sage)", icon: "⊕" },
  cloze: { soft: "var(--lilac-soft)", color: "var(--lilac)", icon: "▭" },
  qa: { soft: "var(--sky-soft)", color: "var(--sky)", icon: "✎" },
  boolean: { soft: "var(--butter-soft)", color: "var(--butter)", icon: "✓" },
};

export const FLASHCARD_STATUS_LABEL: Record<FlashcardStatus, string> = {
  new: "新卡",
  learning: "学习中",
  review: "巩固",
  suspended: "暂停",
};

export const FLASHCARD_DIFFICULTY_LABEL: Record<FlashcardDifficulty, string> = {
  foundation: "基础",
  standard: "标准",
  advanced: "进阶",
};

/** 四档评分：语义色对齐移动端令牌（rose/butter/sky/sage），顺序由难到易 */
export const REVIEW_RATINGS: Array<{
  value: FlashcardReviewRating;
  label: string;
  color: string;
}> = [
  { value: "hard", label: "吃力", color: "var(--rose)" },
  { value: "struggle", label: "一般", color: "var(--butter)" },
  { value: "normal", label: "还行", color: "var(--sky)" },
  { value: "easy", label: "轻松", color: "var(--sage)" },
];

/** 评分按钮上的「下次间隔」预览：与 Rust flashcard_schedule.rs（fsrs crate）同式，
 *  经 @tau/shared/fsrs-schedule 对齐（权威调度在 Rust 侧事务内计算）。 */
export function nextIntervalPreview(
  card: {
    memoryStability: number | null;
    memoryDifficulty: number | null;
    lastReviewTime: number | null;
  },
  rating: FlashcardReviewRating
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
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} 分钟后`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} 小时后`;
  const days = minutes / (24 * 60);
  return `${days >= 10 ? Math.round(days) : Math.round(days * 10) / 10} 天后`;
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

export const DECK_EMOJIS = ["🧠", "📚", "⚡", "🎯", "🧩", "🔬", "🌟", "🚀", "💡", "📝", "📖", "🗺️"];

/** 到期时间的展示文案（列表行用） */
export function formatDueTime(dueTime: number): string {
  const diff = dueTime - Date.now();
  if (diff <= 0) return "立即复习";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "马上到";
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时后`;
  return `${Math.floor(hours / 24)} 天后`;
}
