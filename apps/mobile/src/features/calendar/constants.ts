// 日历领域 17 色数据色板：数据值与 light/dark 显示色对齐桌面 constants/project-colors.ts，
// 不改库内颜色字符串；深色模式（isDark）自动切 dark 值。事件颜色默认继承日历色。

import type { CalendarMessageKey } from "./i18n";
import type { CalendarColorName } from "./types";

export interface CalendarColorEntry {
  name: CalendarColorName;
  message: CalendarMessageKey;
  light: string;
  dark: string;
}

export const CALENDAR_COLORS: readonly CalendarColorEntry[] = [
  { name: "berry-red", message: "color.berry-red", light: "#B8255F", dark: "#D946EF" },
  { name: "red", message: "color.red", light: "#CF473A", dark: "#EF4444" },
  { name: "orange", message: "color.orange", light: "#C77100", dark: "#F97316" },
  { name: "yellow", message: "color.yellow", light: "#B29104", dark: "#EAB308" },
  { name: "olive-green", message: "color.olive-green", light: "#949C31", dark: "#84CC16" },
  { name: "green", message: "color.green", light: "#369307", dark: "#22C55E" },
  { name: "mint-green", message: "color.mint-green", light: "#42A393", dark: "#14B8A6" },
  { name: "teal", message: "color.teal", light: "#148FAD", dark: "#0891B2" },
  { name: "sky-blue", message: "color.sky-blue", light: "#319DC0", dark: "#0EA5E9" },
  { name: "light-blue", message: "color.light-blue", light: "#6988A4", dark: "#3B82F6" },
  { name: "blue", message: "color.blue", light: "#2A67E2", dark: "#2563EB" },
  { name: "grape-purple", message: "color.grape-purple", light: "#692EC2", dark: "#7C3AED" },
  { name: "violet", message: "color.violet", light: "#AC30CC", dark: "#A855F7" },
  { name: "light-orange", message: "color.light-orange", light: "#B2635C", dark: "#FB7185" },
  { name: "charcoal", message: "color.charcoal", light: "#808080", dark: "#6B7280" },
  { name: "gray", message: "color.gray", light: "#999999", dark: "#9CA3AF" },
  { name: "gray-brown", message: "color.gray-brown", light: "#8F7A69", dark: "#A3A3A3" },
];

const COLOR_INDEX = new Map(CALENDAR_COLORS.map(entry => [entry.name, entry]));

/** 取色值：未知数据色回退第 0 色（对齐桌面 getProjectColorValue 的兜底） */
export function calendarColorValue(colorName: string | null | undefined, isDark: boolean): string {
  const entry = colorName ? COLOR_INDEX.get(colorName) : undefined;
  const resolved = entry ?? CALENDAR_COLORS[0];
  return isDark ? resolved.dark : resolved.light;
}

/** 事件行最终颜色：事件覆盖色 > 日历色 > 兜底第 0 色（对齐桌面 event.color || calendar.color） */
export function eventColorValue(
  eventColor: string | null | undefined,
  calendarColor: string | null | undefined,
  isDark: boolean
): string {
  return calendarColorValue(eventColor || calendarColor, isDark);
}
