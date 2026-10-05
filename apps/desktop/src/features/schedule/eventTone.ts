/**
 * 日程颜色与来源识别（第一版唯一新抽的 helper，取代各视图里重复的取色片段）。
 *
 * 颜色：日历/日程仍存 17 色 ProjectColorName（数据不动），渲染改为「软底 + 色条/色点」：
 * 明暗两档色值写进 --cal-l / --cal-d，TONE 类按 .dark 选档到 --cal，
 * 消费方用 TONE_SOFT_BG / bg-[var(--cal)] 等语义组合，不再出现实心色块白字；
 * 时间块按账本阶段取底色（ledgerFill：记录实心、计划空心）。
 *
 * 来源：番茄钟会话与待办同步写进系统日历（主进程 pomodoro.ts / todo-calendar-sync.ts），
 * 按日历归属即可识别，无需逐条查映射。
 */

import type { CSSProperties } from "react";
import { getProjectColorValue, type ProjectColorName } from "@/constants/project-colors";
import type { Calendar, CalendarEvent, CalendarGroup } from "@/types";
import type { LedgerPhase } from "./ledger";

/** 按 .dark 选明暗色值到 --cal（配合 toneStyle 注入的两档变量），同时派生软底色 --cal-soft：
    亮色 = 色值 14% 混入 surface；
    暗色改为 oklab 16% 混入 surface-hover——暖棕 surface 上按 sRGB 低比例混色会发灰发泥，
    抬亮底色 + 感知均匀空间混合让色相更干净 */
export const TONE =
  "[--cal:var(--cal-l)] dark:[--cal:var(--cal-d)] [--cal-soft:color-mix(in_srgb,var(--cal)_14%,var(--tau-bg-surface))] dark:[--cal-soft:color-mix(in_oklab,var(--cal)_16%,var(--tau-bg-surface-hover))]";
/** 数据色软底（需与 TONE 同用） */
export const TONE_SOFT_BG = "bg-[var(--cal-soft)]";
/** 计划（空心）块的描边色 */
export const PLAN_OUTLINE = "color-mix(in srgb, var(--cal) 45%, transparent)";

/** 账本底色：记录实心、计划空心，进行中在已过去比例处切开（需与 TONE 同用） */
export function ledgerFill(phase: LedgerPhase): { className: string; style?: CSSProperties } {
  if (phase.kind === "record") return { className: TONE_SOFT_BG };
  if (phase.kind === "plan") return { className: "bg-surface" };
  const split = `${(phase.split * 100).toFixed(1)}%`;
  return {
    className: "",
    style: {
      background: `linear-gradient(to bottom, var(--cal-soft) ${split}, var(--tau-bg-surface) ${split})`,
    },
  };
}

export function toneStyle(color: ProjectColorName): CSSProperties {
  return {
    "--cal-l": getProjectColorValue(color, "light"),
    "--cal-d": getProjectColorValue(color, "dark"),
  } as CSSProperties;
}

export function resolveEventColor(event: CalendarEvent, calendars: Calendar[]): ProjectColorName {
  return event.color || calendars.find(c => c.id === event.calendarId)?.color || "blue";
}

/** 可直接改时间 / 删除的日程：用户日历里的（系统日历——番茄、截止、周期——只读）；表单与拖拽共用 */
export function isEditableEvent(event: CalendarEvent, calendars: Calendar[]): boolean {
  const calendar = calendars.find(c => c.id === event.calendarId);
  return !!calendar && !calendar.isInSystemGroup;
}

export function eventToneStyle(event: CalendarEvent, calendars: Calendar[]): CSSProperties {
  return toneStyle(resolveEventColor(event, calendars));
}

export type EventSourceKind = "pomodoro" | "todo";
/** 系统日历的细分角色：待办清单下按截止 / 周期区分（计划任务已退役，安排改由用户日历里关联待办的事件表达） */
export type CalendarRole = "pomodoro" | "deadline" | "recurring";

/** 与主进程约定的系统日历名（pomodoro.ts / todo-calendar-sync.ts 的 TODO_CALENDARS） */
const POMODORO_CALENDAR_TITLE = "番茄钟";
const TODO_GROUP_NAME = "待办清单";
const TODO_CALENDAR_ROLES: Record<string, CalendarRole> = {
  截止任务: "deadline",
  周期任务: "recurring",
};

/** calendarId → 系统日历角色（普通日历不在表内） */
export function buildCalendarRoles(
  calendars: Calendar[],
  groups: CalendarGroup[]
): Map<number, CalendarRole> {
  const systemGroup = groups.find(g => g.isSystem && !g.parentGroupId);
  const todoGroup = groups.find(
    g => g.name === TODO_GROUP_NAME && systemGroup && g.parentGroupId === systemGroup.id
  );
  const roles = new Map<number, CalendarRole>();
  for (const calendar of calendars) {
    if (
      systemGroup &&
      calendar.groupId === systemGroup.id &&
      calendar.title === POMODORO_CALENDAR_TITLE
    ) {
      roles.set(calendar.id, "pomodoro");
    } else if (todoGroup && calendar.groupId === todoGroup.id) {
      // 待办清单下名称不认识的日历按截止处理：标记，不进时间轴
      roles.set(calendar.id, TODO_CALENDAR_ROLES[calendar.title] ?? "deadline");
    }
  }
  return roles;
}

/** calendarId → 来源类型（番茄钟 / 待办），由角色归并 */
export function buildCalendarKinds(
  calendars: Calendar[],
  groups: CalendarGroup[]
): Map<number, EventSourceKind> {
  const kinds = new Map<number, EventSourceKind>();
  for (const [id, role] of buildCalendarRoles(calendars, groups)) {
    kinds.set(id, role === "pomodoro" ? "pomodoro" : "todo");
  }
  return kinds;
}

/** 番茄钟日程标题由主进程写成「🍅 预设名」，图标化后去掉前缀 */
export function displayTitle(event: CalendarEvent, kind: EventSourceKind | undefined): string {
  if (kind === "pomodoro") return event.title.replace(/^🍅\s*/u, "");
  return event.title;
}
