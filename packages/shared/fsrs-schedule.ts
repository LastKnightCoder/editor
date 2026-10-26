/**
 * FSRS 调度封装（桌面主进程/桌面渲染层/移动前端共用）。
 *
 * 契约：FSRS-6 默认 21 参数（与 fsrs-rs DEFAULT_PARAMETERS 逐值一致）、期望保留率 0.9、
 * 关闭 fuzz、间隔以天为单位不取整——与移动端 Rust 权威实现
 * （apps/mobile/src-tauri/src/database/flashcard_schedule.rs，fsrs crate）逐值对齐，
 * 由 fsrs-schedule.fixture.json 两端对拍钉住；修改任何常量前先跨端同步。
 */

import { FSRSAlgorithm, generatorParameters } from "ts-fsrs";

export const FSRS_WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const;

export const FSRS_DESIRED_RETENTION = 0.9;

export const FSRS_DAY_MS = 86_400_000;

const algorithm = new FSRSAlgorithm(
  generatorParameters({
    w: [...FSRS_WEIGHTS],
    request_retention: FSRS_DESIRED_RETENTION,
    enable_fuzz: false,
    enable_short_term: true,
  })
);

/** FSRS 评分档：1=Again 忘记 / 2=Hard 模糊 / 3=Good 记得 / 4=Easy 轻松 */
export type FsrsGrade = 1 | 2 | 3 | 4;

/** 评分四档 → FSRS Grade（两端共用同一映射）；default throw 兜住 IPC 层的运行时非法值，防 NaN 静默落库 */
export function fsrsGradeOf(rating: "hard" | "struggle" | "normal" | "easy"): FsrsGrade {
  switch (rating) {
    case "hard":
      return 1;
    case "struggle":
      return 2;
    case "normal":
      return 3;
    case "easy":
      return 4;
    default: {
      const exhaustive: never = rating;
      throw new Error(`未知闪卡评分: ${String(exhaustive)}`);
    }
  }
}

export interface FsrsMemoryState {
  /** 稳定性（天）：保留率衰减到期望值所需间隔 */
  stability: number;
  /** 难度 1–10 */
  difficulty: number;
}

export interface FsrsScheduleResult extends FsrsMemoryState {
  /** 下次复习间隔（天，可为小数；fsrs-rs 语义不取整） */
  intervalDays: number;
}

/**
 * 评分推进记忆状态：memory 为 null 表示新卡首评（走初始稳定性分支）。
 * elapsedDays 必须为整数天（floor(毫秒差/86400000)），两端在此口径下逐值一致
 * （fsrs-rs step 的短期分支在 delta_t==0 触发，与整数天口径吻合）。
 */
export function fsrsSchedule(
  memory: FsrsMemoryState | null,
  elapsedDays: number,
  grade: FsrsGrade
): FsrsScheduleResult {
  const next = algorithm.next_state(memory, elapsedDays, grade);
  return { ...next, intervalDays: fsrsIntervalDays(next.stability) };
}

/** fsrs-rs model.rs next_interval 同式：S / FACTOR × (R^(1/DECAY) − 1)，不取整不截断 */
function fsrsIntervalDays(stability: number): number {
  const decay = -FSRS_WEIGHTS[20];
  const factor = Math.exp(Math.log(0.9) / decay) - 1;
  return (stability / factor) * (Math.pow(FSRS_DESIRED_RETENTION, 1 / decay) - 1);
}

/** 自上次复习经过的整天数（不足一天按 0，走短期分支） */
export function fsrsElapsedDays(lastReviewMs: number | null, nowMs: number): number {
  return lastReviewMs == null ? 0 : Math.max(0, Math.floor((nowMs - lastReviewMs) / FSRS_DAY_MS));
}

/** 间隔毫秒（due_time = now + fsrsIntervalMs(intervalDays)） */
export function fsrsIntervalMs(intervalDays: number): number {
  return Math.round(intervalDays * FSRS_DAY_MS);
}

/** 评分后的状态：间隔 ≥1 天为巩固，否则学习中（"new"/"suspended" 由调用方维护） */
export function fsrsStatusAfter(intervalDays: number): "learning" | "review" {
  return intervalDays >= 1 ? "review" : "learning";
}
