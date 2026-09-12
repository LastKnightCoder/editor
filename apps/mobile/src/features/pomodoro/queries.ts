// 番茄专注域查询 hooks：组件直接订阅 query 缓存，mutation 后由
// usePomodoroController invalidateQueries(["pomodoro"]) 驱动刷新。

import { useQuery } from "@tanstack/react-query";
import { getQueryClient } from "../../router";
import type { PomodoroPreset, PomodoroSession } from "../../types";
import * as tauri from "../../services/tauri";
import { startOfWeek, todayRange } from "./timer";

const POMODORO_STALE_MS = 30_000;

export function usePomodoroPresets(enabled = true) {
  return useQuery({
    queryKey: ["pomodoro", "presets"],
    queryFn: () => tauri.pomodoroListPresets(),
    staleTime: POMODORO_STALE_MS,
    enabled,
  });
}

/** 未归档预设按既定顺序；附归档分区（P3 管理用） */
export function splitPresets(presets: PomodoroPreset[]) {
  const active = presets.filter(preset => !preset.archived);
  const archived = presets.filter(preset => preset.archived);
  return { active, archived };
}

export function usePomodoroTodaySummary(enabled = true) {
  return useQuery({
    queryKey: ["pomodoro", "summary", "today"],
    queryFn: () => {
      const { start, end } = todayRange();
      return tauri.pomodoroSummaryToday(start, end);
    },
    staleTime: POMODORO_STALE_MS,
    enabled,
  });
}

export function usePomodoroTotalSummary(enabled = true) {
  return useQuery({
    queryKey: ["pomodoro", "summary", "total"],
    queryFn: () => tauri.pomodoroSummaryTotal(),
    staleTime: POMODORO_STALE_MS,
    enabled,
  });
}

/** 按周聚合（周一→周日）；weekOffset=0 为本周，负数往过去翻 */
export function usePomodoroWeeklySummary(weekOffset = 0, enabled = true) {
  return useQuery({
    queryKey: ["pomodoro", "summary", "week", weekOffset],
    queryFn: () => tauri.pomodoroSummaryDaily(weekDayStartsAt(weekOffset)),
    staleTime: POMODORO_STALE_MS,
    enabled,
  });
}

function weekDayStartsAt(weekOffset: number): number[] {
  const monday = startOfWeek(weekOffset);
  return Array.from({ length: 7 }, (_, i) => monday + i * 24 * 60 * 60 * 1000);
}

export type PomodoroSessionsParams = {
  presetId?: number;
  start?: number;
  end?: number;
  limit?: number;
  offset?: number;
};

/** 历史会话分页查询（已落库：completed/stopped） */
export function usePomodoroSessions(params: PomodoroSessionsParams = {}, enabled = true) {
  return useQuery({
    queryKey: [
      "pomodoro",
      "sessions",
      params.presetId ?? "all",
      params.start ?? null,
      params.end ?? null,
      params.offset ?? 0,
    ],
    queryFn: () =>
      tauri.pomodoroListSessions({
        offset: params.offset,
        limit: params.limit,
        presetId: params.presetId,
        start: params.start,
        end: params.end,
      }),
    staleTime: POMODORO_STALE_MS,
    enabled,
  });
}

export function invalidatePomodoroQueries() {
  getQueryClient().invalidateQueries({ queryKey: ["pomodoro"] });
}

/** 会话行展示名：预设可能已删除 */
export function presetNameOf(presets: PomodoroPreset[], session: PomodoroSession): string {
  return presets.find(preset => preset.id === session.presetId)?.name ?? "已删除预设";
}
