/**
 * 日程颜色与来源识别（第一版唯一新抽的 helper，取代各视图里重复的取色片段）。
 *
 * 颜色：日历/日程仍存 17 色 ProjectColorName（数据不动），渲染改为「软底 + 色条/色点」：
 * 明暗两档色值写进 --cal-l / --cal-d，TONE 类按 .dark 选档到 --cal，
 * 消费方用 TONE_SOFT_BG / bg-[var(--cal)] 等语义组合，不再出现实心色块白字。
 *
 * 来源：番茄钟会话与待办同步写进系统日历（主进程 pomodoro.ts / todo-calendar-sync.ts），
 * 按日历归属即可识别，无需逐条查映射。
 */

import type { CSSProperties } from "react";
import { getProjectColorValue, type ProjectColorName } from "@/constants/project-colors";
import type { Calendar, CalendarEvent, CalendarGroup } from "@/types";

/** 按 .dark 选明暗色值到 --cal（配合 toneStyle 注入的两档变量） */
export const TONE = "[--cal:var(--cal-l)] dark:[--cal:var(--cal-d)]";
/** 数据色软底：色值 14% 混入 surface */
export const TONE_SOFT_BG = "bg-[color-mix(in_srgb,var(--cal)_14%,var(--tau-bg-surface))]";

export function toneStyle(color: ProjectColorName): CSSProperties {
  return {
    "--cal-l": getProjectColorValue(color, "light"),
    "--cal-d": getProjectColorValue(color, "dark"),
  } as CSSProperties;
}

export function resolveEventColor(event: CalendarEvent, calendars: Calendar[]): ProjectColorName {
  return event.color || calendars.find(c => c.id === event.calendarId)?.color || "blue";
}

export function eventToneStyle(event: CalendarEvent, calendars: Calendar[]): CSSProperties {
  return toneStyle(resolveEventColor(event, calendars));
}

export type EventSourceKind = "pomodoro" | "todo";

/** 与主进程约定的系统日历名（pomodoro.ts / todo-calendar-sync.ts） */
const POMODORO_CALENDAR_TITLE = "番茄钟";
const TODO_GROUP_NAME = "待办清单";

/** calendarId → 来源类型（普通日历不在表内） */
export function buildCalendarKinds(
  calendars: Calendar[],
  groups: CalendarGroup[]
): Map<number, EventSourceKind> {
  const systemGroup = groups.find(g => g.isSystem && !g.parentGroupId);
  const todoGroup = groups.find(
    g => g.name === TODO_GROUP_NAME && systemGroup && g.parentGroupId === systemGroup.id
  );
  const kinds = new Map<number, EventSourceKind>();
  for (const calendar of calendars) {
    if (
      systemGroup &&
      calendar.groupId === systemGroup.id &&
      calendar.title === POMODORO_CALENDAR_TITLE
    ) {
      kinds.set(calendar.id, "pomodoro");
    } else if (todoGroup && calendar.groupId === todoGroup.id) {
      kinds.set(calendar.id, "todo");
    }
  }
  return kinds;
}

/** 番茄钟日程标题由主进程写成「🍅 预设名」，图标化后去掉前缀 */
export function displayTitle(event: CalendarEvent, kind: EventSourceKind | undefined): string {
  if (kind === "pomodoro") return event.title.replace(/^🍅\s*/u, "");
  return event.title;
}
