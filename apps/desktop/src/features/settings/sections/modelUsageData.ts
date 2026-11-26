/**
 * 模型用量分区的纯数据处理：时间范围与趋势序列拼装。
 * 不依赖 React / IPC，单测直接覆盖。
 */

import type { ModelUsageBucket, ModelUsageTimeseriesPoint } from "@/types/model-usage";

export const USAGE_RANGES = ["today", "7d", "30d", "90d"] as const;
export type UsageRangeKey = (typeof USAGE_RANGES)[number];

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const startOfLocalDay = (now: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export interface UsageRange {
  pluginId?: string;
  from: number;
  to: number;
  bucket: ModelUsageBucket;
  /** 与本范围等长的上一段（KPI 环比） */
  previous: { from: number; to: number };
}

/** 范围按本地日历对齐：「近 7 天」= 含今天在内的 7 个自然日；今天按小时分桶 */
export function resolveRange(key: UsageRangeKey, now = Date.now()): UsageRange {
  const today = startOfLocalDay(now);
  const days = key === "today" ? 1 : key === "7d" ? 7 : key === "30d" ? 30 : 90;
  const from = today - (days - 1) * DAY_MS;
  const to = today + DAY_MS;
  const length = to - from;
  return {
    from,
    to,
    bucket: key === "today" ? "hour" : "day",
    previous: { from: from - length, to: from },
  };
}

/** 桶起点序列（缺数据的桶也要占位，折线 / 柱子才连续）；跨夏令时按本地日历递增 */
export function bucketStarts(range: UsageRange): number[] {
  const starts: number[] = [];
  if (range.bucket === "hour") {
    for (let t = range.from; t < range.to; t += HOUR_MS) starts.push(t);
    return starts;
  }
  const d = new Date(range.from);
  while (d.getTime() < range.to) {
    starts.push(d.getTime());
    d.setDate(d.getDate() + 1);
  }
  return starts;
}

export const tzOffsetMinutes = (at = Date.now()) => -new Date(at).getTimezoneOffset();

export type TrendMetric = "cost" | "totalTokens" | "calls";

/**
 * 趋势点 → 堆叠序列：取前 N 个分组（按范围内合计倒序），其余合并为「其他」，
 * 每个分组在每个桶上都有值（0 补齐）。
 */
export function buildTrendSeries(
  points: ModelUsageTimeseriesPoint[],
  starts: number[],
  metric: TrendMetric,
  topN = 5
): { keys: string[]; values: Record<string, number[]> } {
  const totals = new Map<string, number>();
  for (const point of points) {
    totals.set(point.key, (totals.get(point.key) ?? 0) + point[metric]);
  }
  const ranked = [...totals.entries()]
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
  const top = ranked.slice(0, topN);
  const hasOther = ranked.length > topN;
  const keys = hasOther ? [...top, OTHER_KEY] : top;
  const index = new Map(starts.map((start, i) => [start, i]));
  const values: Record<string, number[]> = Object.fromEntries(
    keys.map(key => [key, starts.map(() => 0)])
  );
  for (const point of points) {
    const i = index.get(point.bucketStart);
    if (i === undefined) continue;
    const key = top.includes(point.key) ? point.key : hasOther ? OTHER_KEY : null;
    if (key) values[key][i] += point[metric];
  }
  return { keys, values };
}

export const OTHER_KEY = "\u0000other";

/** 环比：上一段为 0 时无法计算，返回 null */
export function changeRatio(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}
