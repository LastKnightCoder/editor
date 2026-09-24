/**
 * 今日页数据契约 v3（行式布局：行动三卡 / 继续编辑三栏 / 热力图 / 统计四卡）。
 * 注意：番茄钟与日程是两个独立模块——专注数据走 pomodoro 命令、入口跳 pomodoro 页；
 * 日程走 calendar 命令与 schedule page。
 */

export interface TodayEvent {
  id: string;
  title: string;
  timeText: string;
}

export interface TodoTodayItem {
  id: number;
  title: string;
  dueText?: string;
  overdue: boolean;
}

export interface RecentEdit {
  id: string;
  kind: "card" | "article" | "diary" | "project";
  title: string;
  updatedText: string;
  wordsCount: number;
}

export interface FocusSummary {
  sessionCount: number;
  focusMinutes: number;
}

export interface TodayStats {
  cardsCreated: number;
  articlesCreated: number;
  wordsWritten: number;
}

export interface WeeklyStats extends TodayStats {
  focusMinutes: number;
}

export interface ReviewDeckLite {
  id: number;
  name: string;
  dueCount: number;
  totalCards: number;
}

export interface LibraryTotals {
  cards: number;
  articles: number;
  diaries: number;
}

/** 近 30 天走势（统计卡 sparkline 数据源）。words/created 均为当日产出：
 *  卡片/文章取快照差分，日记按 date 归属（word_count 即当天字数）。 */
export interface TrendSeries {
  dates: string[];
  words: number[];
  created: number[];
  focusMinutes: number[];
}

/** CalendarHeatmap 的数据形状（与旧组件 IItem 兼容） */
export interface HeatmapItem {
  date: string;
  count: number;
  operationList: unknown[];
}

export interface HomeSnapshot {
  /** 行动 */
  reviewDueCount: number;
  reviewDecks: ReviewDeckLite[];
  todos: TodoTodayItem[]; // 最多 3 条（三卡高度对齐）
  todoRemainingCount: number;
  events: TodayEvent[]; // 最多 5 条
  /** 内容 */
  recentEdits: RecentEdit[]; // 最多 12 条（三栏 × 4）
  /** 反馈 */
  focus: FocusSummary;
  todayStats: TodayStats;
  weekly: WeeklyStats;
  totals: LibraryTotals;
  trend: TrendSeries;
  heatmapItems: HeatmapItem[]; // 全年，喂 CalendarHeatmap
}
