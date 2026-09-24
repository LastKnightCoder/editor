/** 打卡格状态 → 样式 / 说明（右板周打卡点与详情热力格共用；YearHeatmap 同语言：sunken 空格 + ok 实格） */

import type { HabitCellState } from "../types";

export const CELL_CLASS: Record<HabitCellState, string> = {
  done: "bg-ok",
  skip: "bg-track",
  miss: "bg-danger-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tau-danger)_35%,transparent)]",
  off: "shadow-[inset_0_0_0_1px_var(--tau-line-1)]",
  today: "bg-sunken outline outline-[1.5px] outline-offset-1 outline-[var(--tau-accent)]",
  future: "shadow-[inset_0_0_0_1px_var(--tau-line-1)] opacity-50",
};

export const CELL_TITLE: Record<HabitCellState, string> = {
  done: "已打卡",
  skip: "已跳过",
  miss: "缺卡",
  off: "非计划日",
  today: "今天 · 待打卡",
  future: "",
};
