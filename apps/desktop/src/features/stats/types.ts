/**
 * 统计页数据契约 —— Bento 面板的数据形状（接线见 queries.ts）。
 * 时间范围 range 贯穿趋势/环比/评分/节律四类窗口化数据；总量与热力图与窗口无关。
 */

export type StatsRange = "d30" | "d90" | "year" | "all";

export const STATS_RANGES: { key: StatsRange; label: string }[] = [
  { key: "d30", label: "近 30 天" },
  { key: "d90", label: "近 90 天" },
  { key: "year", label: "今年" },
  { key: "all", label: "全部" },
];

export interface StatsTotals {
  cards: number;
  articles: number;
  diaries: number;
  /** 知识库文档条目数 / 项目文档条目数（轻表计数） */
  documents: number;
  projects: number;
  todoPending: number;
  focusMinutesTotal: number;
  focusSessions: number;
  wordsTotal: number;
  /** 构成五分量（卡片/文章/项目/知识库/日记字数，wordsTotal = 五者之和） */
  cardWords: number;
  articleWords: number;
  projectWords: number;
  documentWords: number;
  diaryWords: number;
}

/** 近 N 天每日产出（字数 / 新建数量） */
export interface TrendDay {
  date: string; // YYYY-MM-DD
  words: number;
  cardsCreated: number;
  articlesCreated: number;
}

/** 窗口聚合（当前/上一窗口各一份，用于环比） */
export interface RangeSummary {
  words: number;
  created: number;
  cardsCreated: number;
  articlesCreated: number;
  activeDays: number;
}

export interface DeckOverview {
  id: number;
  name: string;
  dueCount: number;
  learningCount: number;
  newCount: number;
  totalCards: number;
}

/** 记忆保持：评分四档（easy/normal/struggle/hard）+ 到期预告 */
export interface ReviewStats {
  ratings: { easy: number; normal: number; struggle: number; hard: number };
  total: number;
  /** 未来 7 天（含今日）逐日到期张数 */
  dueBuckets: number[];
}

/** 专注节律：番茄会话按启动时刻的 24h 分布 */
export interface FocusRhythm {
  hourBuckets: number[]; // 长度 24
  sessionCount: number;
  focusMinutes: number;
  avgSessionMinutes: number;
  /** 有过暂停的会话占比（0-1；无会话为 null） */
  interruptRate: number | null;
  /** 最活跃时段（小时，0-23；无会话为 null） */
  peakHour: number | null;
}

export interface HeatmapStats {
  days: { date: string; count: number }[]; // 全年
  streak: number;
  activeDays: number;
}

export interface StatsSnapshot {
  totals: StatsTotals;
  heatmap: HeatmapStats;
  decks: DeckOverview[];
  /** 当前窗口逐日产出（面积趋势图） */
  trend: TrendDay[];
  /** 上一等长窗口聚合；all 无上一窗口为 null */
  previous: RangeSummary | null;
  review: ReviewStats | null;
  rhythm: FocusRhythm | null;
}
