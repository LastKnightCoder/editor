// 日历领域 17 色数据色板：数据值与 light/dark 显示色对齐桌面 constants/project-colors.ts，
// 不改库内颜色字符串；玄夜主题（isDark）自动切 dark 值。事件颜色默认继承日历色。

import type { CalendarColorName } from "./types";

export interface CalendarColorEntry {
  name: CalendarColorName;
  label: string;
  light: string;
  dark: string;
}

export const CALENDAR_COLORS: readonly CalendarColorEntry[] = [
  { name: "berry-red", label: "浆果红", light: "#B8255F", dark: "#D946EF" },
  { name: "red", label: "红色", light: "#CF473A", dark: "#EF4444" },
  { name: "orange", label: "橘黄色", light: "#C77100", dark: "#F97316" },
  { name: "yellow", label: "黄色", light: "#B29104", dark: "#EAB308" },
  { name: "olive-green", label: "橄榄绿", light: "#949C31", dark: "#84CC16" },
  { name: "green", label: "绿色", light: "#369307", dark: "#22C55E" },
  { name: "mint-green", label: "薄荷绿", light: "#42A393", dark: "#14B8A6" },
  { name: "teal", label: "水鸭色", light: "#148FAD", dark: "#0891B2" },
  { name: "sky-blue", label: "天蓝色", light: "#319DC0", dark: "#0EA5E9" },
  { name: "light-blue", label: "淡蓝色", light: "#6988A4", dark: "#3B82F6" },
  { name: "blue", label: "蓝色", light: "#2A67E2", dark: "#2563EB" },
  { name: "grape-purple", label: "葡萄紫", light: "#692EC2", dark: "#7C3AED" },
  { name: "violet", label: "紫罗兰", light: "#AC30CC", dark: "#A855F7" },
  { name: "light-orange", label: "浅橙色", light: "#B2635C", dark: "#FB7185" },
  { name: "charcoal", label: "炭灰色", light: "#808080", dark: "#6B7280" },
  { name: "gray", label: "灰色", light: "#999999", dark: "#9CA3AF" },
  { name: "gray-brown", label: "灰褐色", light: "#8F7A69", dark: "#A3A3A3" },
];

const COLOR_INDEX = new Map(CALENDAR_COLORS.map(entry => [entry.name, entry]));

/** 取色值：未知数据色回退第 0 色（对齐桌面 getProjectColorValue 的兜底） */
export function calendarColorValue(colorName: string | null | undefined, isDark: boolean): string {
  const entry = colorName ? COLOR_INDEX.get(colorName) : undefined;
  const resolved = entry ?? CALENDAR_COLORS[0];
  return isDark ? resolved.dark : resolved.light;
}

export function calendarColorLabel(colorName: string | null | undefined): string {
  const entry = colorName ? COLOR_INDEX.get(colorName) : undefined;
  return entry?.label ?? CALENDAR_COLORS[0].label;
}

/** 事件行最终颜色：事件覆盖色 > 日历色 > 兜底第 0 色（对齐桌面 event.color || calendar.color） */
export function eventColorValue(
  eventColor: string | null | undefined,
  calendarColor: string | null | undefined,
  isDark: boolean
): string {
  return calendarColorValue(eventColor || calendarColor, isDark);
}
