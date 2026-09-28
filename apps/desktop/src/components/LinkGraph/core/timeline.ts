/**
 * 入场播放的时间轴（批次 4）。纯计算：不碰 DOM、不持有时钟，渲染器只读它算出的显现进度。
 *
 * 时间映射按「排名」而不是真实时间：卡片有高峰也有长达几个月的空窗期，
 * 按真实时间线性播放时，空窗期是几秒钟的空白、高峰期几十张卡同时蹦出来。
 * 按排名映射后每张卡分到的播放时长相同，节奏均匀；同一时刻创建的卡片排名相邻，
 * 仍然是一起出现。进度条上的日期按排名反查，所以拖到哪显示的都是真实日期。
 *
 * 规模：播放时长按卡片数取对数封顶，不随卡片数线性变长（2 万张不能播半小时）。
 * 卡片多时逐卡看不清，远景看到的自然是主题岛一块块长大（同主题的卡片挨着）。
 */

import type { GraphNode } from "./types";

/** 每张卡从出现到长满的时长，占整条时间轴的比例上限 */
const MAX_POP_SHARE = 0.08;
/** 每张卡从出现到长满的绝对时长下限（毫秒）：太快就看不出「长出来」 */
const MIN_POP_MS = 220;

/** 一倍速下的总播放时长（毫秒）：50 张约 6 秒，700 张约 12 秒，2 万张约 20 秒 */
export function baseDuration(count: number): number {
  if (count <= 1) return 1500;
  return Math.round(Math.min(20_000, Math.max(4000, 4000 * Math.log10(count) - 1000)));
}

export interface Timeline {
  /** 按出现先后排好的节点 id */
  order: number[];
  /** 节点 id → 出现时刻（0..1，时间轴上的归一位置） */
  startOf: Map<number, number>;
  /** 每张卡从出现到长满占的时间轴比例 */
  pop: number;
  /** 一倍速总时长（毫秒） */
  duration: number;
  /** 排名 → 创建时间，给进度条显示日期用 */
  times: number[];
}

/**
 * 建时间轴。createdAt 相同的节点（批量导入）并列排名，同时出现；
 * 没有时间的（0）排在最前——它们是最早的历史数据。
 */
export function buildTimeline(nodes: readonly GraphNode[]): Timeline {
  const sorted = [...nodes].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const count = sorted.length;
  const duration = baseDuration(count);
  const pop = Math.min(MAX_POP_SHARE, Math.max(MIN_POP_MS / duration, 1 / Math.max(1, count)));
  const startOf = new Map<number, number>();
  const times: number[] = [];
  // 出现时刻均匀铺在 [0, 1 - pop]，保证最后一张在进度走到 1 时正好长满
  const span = Math.max(0, 1 - pop);
  let rank = 0;
  for (let i = 0; i < count; i++) {
    // 同一时刻创建的并列：沿用前一张的排名
    if (i > 0 && sorted[i].createdAt !== sorted[i - 1].createdAt) rank = i;
    startOf.set(sorted[i].id, count <= 1 ? 0 : (rank / (count - 1)) * span);
    times.push(sorted[i].createdAt);
  }
  return { order: sorted.map(node => node.id), startOf, pop, duration, times };
}

/**
 * 进度 progress（0..1）时每个节点的显现程度：0 未出现，1 长满。
 * 已经长满的不写进结果（渲染器按缺省即 1 处理），所以播放后半段 map 越来越小。
 */
export function revealAt(timeline: Timeline, progress: number): Map<number, number> {
  const reveal = new Map<number, number>();
  if (progress >= 1) return reveal;
  for (const id of timeline.order) {
    const start = timeline.startOf.get(id) ?? 0;
    const local = (progress - start) / timeline.pop;
    if (local >= 1) continue;
    reveal.set(id, Math.max(0, local));
  }
  return reveal;
}

/** 进度对应的创建时间（按排名反查），进度条上显示「播到了哪一天」 */
export function timeAt(timeline: Timeline, progress: number): number {
  const { times, pop } = timeline;
  if (times.length === 0) return 0;
  const span = Math.max(1e-9, 1 - pop);
  const index = Math.round(Math.min(1, Math.max(0, progress / span)) * (times.length - 1));
  return times[index];
}

/** 已经出现（开始长出来）的卡片数，进度条旁显示「第几张」 */
export function shownCount(timeline: Timeline, progress: number): number {
  if (progress >= 1) return timeline.order.length;
  let count = 0;
  for (const id of timeline.order) if ((timeline.startOf.get(id) ?? 0) < progress) count++;
  return count;
}

/**
 * 弹簧曲线：从 0 冲到 1 稍过一点再回落。用于节点半径，
 * 比缓动曲线更像「长出来」；透明度用 local 本身（线性），避免闪。
 */
export function springScale(local: number): number {
  if (local <= 0) return 0;
  if (local >= 1) return 1;
  const damping = 7;
  const frequency = 10;
  return 1 - Math.exp(-damping * local) * Math.cos(frequency * local);
}
