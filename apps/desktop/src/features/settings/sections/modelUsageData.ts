/**
 * 模型用量分区的纯数据处理：时间范围、数值格式化、趋势序列拼装、功能名映射。
 * 不依赖 React / IPC，单测直接覆盖。
 */

import type { ModelUsageBucket, ModelUsageTimeseriesPoint } from "@/types/model-usage";

export type UsageRangeKey = "today" | "7d" | "30d" | "90d";

export const RANGE_LABELS: Record<UsageRangeKey, string> = {
  today: "今天",
  "7d": "近 7 天",
  "30d": "近 30 天",
  "90d": "近 90 天",
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const startOfLocalDay = (now: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export interface UsageRange {
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

/** 功能槽 / 会话类别 → 中文名；未登记的原样显示 */
const FEATURE_LABELS: Record<string, string> = {
  chat: "对话",
  titleSummary: "标题总结",
  webClip: "网页剪藏",
  podcastGeneration: "播客生成",
  flashcardGeneration: "闪卡生成",
  aiJudgement: "答案评判",
  transcriptionOptimization: "转录断句优化",
  videoSummary: "视频总结",
  videoEbookRewrite: "视频电子书重写",
  vibeLearningImageDescription: "图片理解",
  contentMetadata: "笔记元信息",
  videoInsights: "视频洞察",
  videoHighlights: "视频要点",
  topicHighlights: "话题要点",
  contentPolish: "内容润色",
  skillDraft: "技能草拟",
  inlineAssistant: "行内助手",
  subagent: "子代理调研",
  pdfChat: "PDF 对话",
  videoNoteChat: "视频笔记对话",
  vibeLearningChat: "Vibe Learning 对话",
  browserChat: "浏览器扩展对话",
  unknown: "未标注",
};

const GENERATION_LABELS: Record<string, string> = {
  outline: "大纲",
  mindmap: "导图",
  highlights: "要点",
  article: "文章",
  quiz: "测验",
  ppt: "演示",
  ppt_edit: "演示修改",
};

export function featureLabel(feature: string): string {
  if (feature === OTHER_KEY) return "其他";
  if (FEATURE_LABELS[feature]) return FEATURE_LABELS[feature];
  if (feature.startsWith("generation:")) {
    const task = feature.slice("generation:".length);
    return `生成·${GENERATION_LABELS[task] ?? task}`;
  }
  if (feature.startsWith("aiServer:")) {
    const inner = feature.slice("aiServer:".length);
    return `外部调用·${FEATURE_LABELS[inner] ?? inner}`;
  }
  return feature || "未标注";
}

export function formatCost(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 100) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} 分 ${Math.round((ms % 60_000) / 1000)} 秒`;
}

/** 环比：上一段为 0 时无法计算，返回 null */
export function changeRatio(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export function formatBucketLabel(start: number, bucket: ModelUsageBucket): string {
  const d = new Date(start);
  const pad = (n: number) => String(n).padStart(2, "0");
  return bucket === "hour" ? `${pad(d.getHours())}:00` : `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatEventTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
