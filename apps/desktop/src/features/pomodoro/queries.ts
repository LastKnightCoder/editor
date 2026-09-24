/**
 * 番茄专注数据源：预设全量 + 近 WINDOW_DAYS 天会话（今日摘要、连续天数、落在近期的账本窗口都从这份切）；
 * 账本窗口早于近期窗口时按起止单独查；「全部」视图才拉全量；最早一条记录单独取（决定往年快捷项与翻页下限）。
 *
 * 刷新：会话结束（本窗口或其他窗口操作、倒计时到点）由 timerStore 的结束结果驱动失效；
 * 本页的变更函数调命令后自行失效。首页「已专注」与统计页的专注数据同批失效。
 */

import { useEffect, useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  summaryPomodoroTotal,
  archivePomodoroPreset,
  createPomodoroPreset,
  deletePomodoroPreset,
  deletePomodoroSession,
  listPomodoroPresets,
  listPomodoroSessions,
  reorderPomodoroPresets,
  updatePomodoroPreset,
  updatePomodoroSession,
} from "@/commands/pomodoro";
import type { PomodoroMode, PomodoroPreset, PomodoroSession } from "@/types";
import { DAY_MS, startOfDay } from "./model";
import { addDays, type DayWindow } from "./range";
import { usePomodoroTimer } from "./timerStore";

/** 会话窗口天数：覆盖账本最长区间，连续天数超过即显示「N+」 */
export const WINDOW_DAYS = 90;

const PRESETS_KEY = ["pomodoro", "presets"] as const;
const SESSIONS_KEY = ["pomodoro", "sessions"] as const;

/** enabled：辅助窗口在数据库连上之前不查 */
export function usePomodoroPresets(enabled = true) {
  const query = useQuery({
    queryKey: PRESETS_KEY,
    queryFn: listPomodoroPresets,
    staleTime: 60_000,
    enabled,
  });
  const presets = query.data;
  return useMemo(() => {
    const all = presets ?? [];
    return {
      loading: query.isPending,
      all,
      byId: new Map(all.map(p => [p.id, p])),
      active: all.filter(p => !p.archived).sort((a, b) => a.sortOrder - b.sortOrder),
      archived: all.filter(p => p.archived),
    };
  }, [presets, query.isPending]);
}

/** 近 WINDOW_DAYS 天会话（按开始时刻降序）；窗口起点随日期滚动，跨零点自动重拉 */
export function usePomodoroSessions(now: number) {
  const since = startOfDay(now) - (WINDOW_DAYS - 1) * DAY_MS;
  const query = useQuery({
    queryKey: [...SESSIONS_KEY, since],
    queryFn: () => listPomodoroSessions({ start: since, limit: 100_000 }),
    staleTime: 60_000,
  });
  return { sessions: query.data, loading: query.isPending, since };
}

/** 账本窗口的会话：落在近期窗口内时直接复用近期数据，否则按起止单独查 */
export function useWindowSessions(
  window: DayWindow,
  recent: { sessions: PomodoroSession[] | undefined; since: number },
  enabled = true
) {
  const covered = window.from >= recent.since;
  const end = addDays(window.to, 1);
  const query = useQuery({
    queryKey: [...SESSIONS_KEY, "range", window.from, end],
    queryFn: () => listPomodoroSessions({ start: window.from, end, limit: 100_000 }),
    staleTime: 60_000,
    enabled: enabled && !covered,
    placeholderData: keepPreviousData,
  });
  const sessions = useMemo(() => {
    if (!covered) return query.data;
    return recent.sessions?.filter(s => s.startTime >= window.from && s.startTime < end);
  }, [covered, query.data, recent.sessions, window.from, end]);
  return { sessions, loading: covered ? recent.sessions == null : query.isPending };
}

/** 全部会话（仅「全部」视图启用） */
export function useAllSessions(enabled: boolean) {
  const query = useQuery({
    queryKey: [...SESSIONS_KEY, "all"],
    queryFn: () => listPomodoroSessions({ limit: 1_000_000 }),
    staleTime: 60_000,
    enabled,
  });
  return { sessions: query.data, loading: enabled && query.isPending };
}

/** 最早一条记录所在日（无记录为 null）：按总数取最后一条，避免为此拉全量 */
export function useEarliestDay() {
  const query = useQuery({
    queryKey: [...SESSIONS_KEY, "earliest"],
    queryFn: async () => {
      const { count } = await summaryPomodoroTotal();
      if (!count) return null;
      const [oldest] = await listPomodoroSessions({ limit: 1, offset: count - 1 });
      return oldest ? startOfDay(oldest.startTime) : null;
    },
    staleTime: 5 * 60_000,
  });
  return query.data ?? null;
}

/** 会话结束（任意窗口 / 到点）后失效会话与跨页专注数据 */
export function useInvalidateOnSessionEnd() {
  const queryClient = useQueryClient();
  const seq = usePomodoroTimer(s => s.lastResult?.seq);
  useEffect(() => {
    if (seq == null) return;
    // 主进程先落库再广播，但留一拍余量给写入与日历映射
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [seq, queryClient]);
}

export interface PresetDraft {
  name: string;
  mode: PomodoroMode;
  durationMin: number;
}

export function usePomodoroMutations() {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const refreshPresets = () => queryClient.invalidateQueries({ queryKey: PRESETS_KEY });
    const refreshSessions = () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["stats"] }),
      ]);
    const toPayload = (draft: PresetDraft) => ({
      name: draft.name,
      mode: draft.mode,
      durationMin: draft.mode === "countdown" ? draft.durationMin : undefined,
    });
    return {
      async createPreset(draft: PresetDraft) {
        const created = await createPomodoroPreset(toPayload(draft));
        await refreshPresets();
        return created;
      },
      async updatePreset(id: number, draft: PresetDraft) {
        await updatePomodoroPreset({ id, ...toPayload(draft) });
        await refreshPresets();
      },
      async setArchived(id: number, archived: boolean) {
        await archivePomodoroPreset(id, archived);
        await refreshPresets();
      },
      async deletePreset(id: number) {
        await deletePomodoroPreset(id);
        await refreshPresets();
      },
      /** 乐观重排：先改缓存 sortOrder，再落库 */
      async reorder(orderedActiveIds: number[]) {
        queryClient.setQueryData<PomodoroPreset[]>(PRESETS_KEY, prev =>
          prev?.map(p => {
            const index = orderedActiveIds.indexOf(p.id);
            return index >= 0 ? { ...p, sortOrder: index } : p;
          })
        );
        const archivedIds = (queryClient.getQueryData<PomodoroPreset[]>(PRESETS_KEY) ?? [])
          .filter(p => p.archived)
          .map(p => p.id);
        await reorderPomodoroPresets([...orderedActiveIds, ...archivedIds]);
        await refreshPresets();
      },
      async deleteSession(id: number) {
        await deletePomodoroSession(id);
        await refreshSessions();
      },
      /** 只能改专注时长：主进程按新时长重算结束时间与暂停段，并重建日历事件 */
      async updateFocus(id: number, focusMs: number) {
        await updatePomodoroSession(id, focusMs);
        await refreshSessions();
      },
    };
  }, [queryClient]);
}

export type PomodoroMutations = ReturnType<typeof usePomodoroMutations>;
