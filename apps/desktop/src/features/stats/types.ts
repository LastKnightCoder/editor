/**
 * 统计页数据契约 —— 回顾型数据的形状（接线见 queries.ts）。
 */

export interface StatsTotals {
  cards: number;
  articles: number;
  diaries: number;
  todoPending: number;
  focusMinutesTotal: number;
  wordsTotal: number;
}

/** 近 N 天每日产出（字数 / 新建数量） */
export interface TrendDay {
  date: string; // YYYY-MM-DD
  words: number;
  cardsCreated: number;
  articlesCreated: number;
}

export interface DeckOverview {
  id: number;
  name: string;
  dueCount: number;
  learningCount: number;
  newCount: number;
  totalCards: number;
}

export interface StatsSnapshot {
  totals: StatsTotals;
  heatmap: { date: string; count: number }[]; // 全年
  trend: TrendDay[]; // 近 30 天
  decks: DeckOverview[];
}
