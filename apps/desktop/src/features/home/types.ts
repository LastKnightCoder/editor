/**
 * 今日页数据契约 v4（原统计页并入）：按时间方向分三段——
 *   今天（复习/待办/日程）→ 继续（最近编辑/探究中的问题）→ 回顾（热力图 + 窗口化统计）。
 * 同一份数据全页只出现一次：今天的数字只在 hero，窗口汇总只在回顾段。
 * 前两段 + 热力图走 HomeSnapshot（queries.ts）；回顾段的窗口化数据走 RetroSnapshot（retroQueries.ts），
 * 滚到回顾段才拉取。
 * 注意：番茄钟与日程是两个独立模块——专注数据走 pomodoro 命令、入口跳 pomodoro 页；
 * 日程走 calendar 命令与 schedule page。
 */

/* ---------- 今天 / 继续（HomeSnapshot） ---------- */

export interface TodayEvent {
  id: number;
  title: string;
  timeText: string;
}

export interface TodoTodayItem {
  id: number;
  title: string;
  dueText?: string;
  overdue: boolean;
}

export type RecentEdit =
  | {
      id: string;
      kind: "card" | "article";
      /** 卡片 / 文章 id，直达详情页 */
      targetId: number;
      title: string;
      updatedText: string;
      wordsCount: number;
    }
  | {
      id: string;
      kind: "diary";
      /** 日记日期（YYYY-MM-DD），定位日记流到当天 */
      date: string;
      title: string;
      updatedText: string;
      wordsCount: number;
    }
  | {
      id: string;
      kind: "project";
      /** 项目条目直达详情页：所属项目取首个；散页未归属项目时缺省，点击退回项目列表 */
      projectId?: number;
      /** 项目文档条目 id，进入详情后定位到该文档 */
      itemId: number;
      title: string;
      updatedText: string;
      wordsCount: number;
    };

export interface FocusSummary {
  sessionCount: number;
  focusMinutes: number;
}

export interface TodayStats {
  cardsCreated: number;
  articlesCreated: number;
  wordsWritten: number;
}

/** 复习卡的卡组行：三段条 = 到期 / 学习中 / 已掌握（其余为新卡） */
export interface ReviewDeckLite {
  id: number;
  name: string;
  dueCount: number;
  learningCount: number;
  newCount: number;
  totalCards: number;
}

export interface HeatmapStats {
  days: { date: string; count: number }[]; // 全年
  streak: number;
  activeDays: number;
}

export interface HomeSnapshot {
  /** 今天 */
  reviewDueCount: number;
  reviewDecks: ReviewDeckLite[]; // 到期多的在前，最多 4 组
  todos: TodoTodayItem[]; // 最多 4 条（三卡高度对齐）
  todoRemainingCount: number;
  events: TodayEvent[]; // 最多 5 条
  /** 继续 */
  recentEdits: RecentEdit[]; // 最多 12 条（三栏 × 4）
  /** hero：今天的数字 */
  focus: FocusSummary;
  todayStats: TodayStats;
  /** 回顾：全年热力图（与时间窗无关，streak 同时供 hero） */
  heatmap: HeatmapStats;
}

/* ---------- 回顾（RetroSnapshot，窗口化） ---------- */

export type RetroRange = "d30" | "d90" | "year" | "all";

export const RETRO_RANGES: { key: RetroRange; label: string }[] = [
  { key: "d30", label: "近 30 天" },
  { key: "d90", label: "近 90 天" },
  { key: "year", label: "今年" },
  { key: "all", label: "全部" },
];

export interface RetroTotals {
  cards: number;
  articles: number;
  diaries: number;
  /** 项目文档条目数（轻表计数） */
  projects: number;
  wordsTotal: number;
  /** 构成四分量（卡片/文章/项目/日记字数，wordsTotal = 四者之和） */
  cardWords: number;
  articleWords: number;
  projectWords: number;
  diaryWords: number;
}

/** 窗口内每日产出（字数 / 新建数量） */
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

export interface RetroSnapshot {
  totals: RetroTotals;
  /** 当前窗口逐日产出（面积趋势图） */
  trend: TrendDay[];
  /** 上一等长窗口聚合；all 无上一窗口为 null */
  previous: RangeSummary | null;
  review: ReviewStats | null;
  rhythm: FocusRhythm | null;
}
