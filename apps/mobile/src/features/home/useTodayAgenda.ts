// 首页「接下来」清单：把各模块的今日状态归一成议程条目，未完成的按优先级排前、已完成的沉底。
// 标题栏的「今天还有 N 件事」与清单共用本 hook，query 由 react-query 去重。

import { useMemo } from "react";
import { useDiaryEntries } from "../diary/queries";
import { computeDailyStreak, getTodayDateKey } from "../diary/feedUtils";
import {
  todayReviewedCount,
  totalDueOf,
  useFlashcardDecks,
  useFlashcardReviewStats,
} from "../flashcard/queries";
import { useTodoGroupStats, useTodoSystemGroups } from "../todo/queries";
import { usePomodoroTodaySummary } from "../pomodoro/queries";
import { formatFocusDuration } from "../pomodoro/timer";
import { useCalendarEventsByRange, useCalendars } from "../calendar/queries";
import { addDays, summarizeToday, todayStart } from "../calendar/utils";
import type { DiaryEntry } from "../../types";

export type AgendaKind = "calendar" | "flashcard" | "todo" | "diary" | "pomodoro";

export type AgendaItem = {
  kind: AgendaKind;
  title: string;
  subtitle: string;
  done: boolean;
  /** 仅任务条目：全部任务的完成进度 */
  progress?: { completed: number; total: number };
};

export type TodayAgendaModules = {
  todoEnabled: boolean;
  diaryEnabled: boolean;
  pomodoroEnabled: boolean;
  calendarEnabled: boolean;
};

export type TodoTotals = { total: number; uncompleted: number; completed: number };

const AGENDA_PRIORITY: AgendaKind[] = ["calendar", "flashcard", "todo", "diary", "pomodoro"];
/** 日记今日状态：是否已写 + 连续天数（今天没写不算断） */
function diaryStatusOf(entries: DiaryEntry[]): { writtenToday: boolean; streak: number } {
  const dailyDates = new Set(
    entries.filter(entry => entry.type === "daily").map(entry => entry.date)
  );
  return {
    writtenToday: dailyDates.has(getTodayDateKey()),
    streak: computeDailyStreak(dailyDates, new Date()),
  };
}

export function useTodayAgenda(modules: TodayAgendaModules) {
  const todoStatsQuery = useTodoGroupStats(modules.todoEnabled);
  const systemGroupsQuery = useTodoSystemGroups(modules.todoEnabled);
  const diaryEntriesQuery = useDiaryEntries(modules.diaryEnabled);
  const flashcardDecksQuery = useFlashcardDecks();
  const flashcardStatsQuery = useFlashcardReviewStats(1);
  const pomodoroSummaryQuery = usePomodoroTodaySummary(modules.pomodoroEnabled);
  // 「今天」每次渲染重算，跨午夜后 queryKey 变化自动重新查询
  const todayStartMs = todayStart();
  // 与日历主页可见性语义一致：按库内 visible 过滤
  const { data: calendars = null } = useCalendars();
  const visibleCalendarIds =
    calendars?.filter(calendar => calendar.visible).map(calendar => calendar.id) ?? null;
  const calendarTodayQuery = useCalendarEventsByRange({
    startDate: todayStartMs,
    endDate: addDays(todayStartMs, 1) - 1,
    calendarIds: visibleCalendarIds ?? [],
    // 日历列表未加载完成前不发查询；空 ids 表示不显示任何日历
    enabled: modules.calendarEnabled && visibleCalendarIds !== null,
  });

  const todoTotals = useMemo<TodoTotals | null>(() => {
    if (!modules.todoEnabled) return null;
    const allGroupId = (systemGroupsQuery.data ?? []).find(group => group.systemType === "all")?.id;
    const stats = allGroupId != null ? todoStatsQuery.data?.[allGroupId] : undefined;
    if (!stats) return null;
    return {
      total: stats.total,
      uncompleted: stats.uncompleted,
      completed: Math.max(0, stats.total - stats.uncompleted),
    };
  }, [modules.todoEnabled, systemGroupsQuery.data, todoStatsQuery.data]);

  const items = useMemo(() => {
    const result: AgendaItem[] = [];

    if (modules.calendarEnabled && calendarTodayQuery.data) {
      const summary = summarizeToday(calendarTodayQuery.data);
      const done = summary.upcoming === 0;
      result.push({
        kind: "calendar",
        title: done
          ? summary.total === 0
            ? "今天没有日程"
            : "今天的日程已结束"
          : `今天还有 ${summary.upcoming} 件日程`,
        subtitle: done ? "" : summary.headline,
        done,
      });
    }

    if (flashcardDecksQuery.data) {
      const due = totalDueOf(flashcardDecksQuery.data);
      const reviewed = todayReviewedCount(flashcardStatsQuery.data);
      result.push({
        kind: "flashcard",
        title:
          due > 0 ? `复习 ${due} 张闪卡` : reviewed > 0 ? "闪卡复习完了" : "今天没有要复习的闪卡",
        subtitle: due > 0 || reviewed > 0 ? `今天已复习 ${reviewed} 张` : "",
        done: due === 0,
      });
    }

    if (todoTotals) {
      result.push({
        kind: "todo",
        title:
          todoTotals.uncompleted > 0
            ? `还剩 ${todoTotals.uncompleted} 项任务`
            : todoTotals.total > 0
              ? "任务都完成了"
              : "还没有任务",
        subtitle: "",
        done: todoTotals.uncompleted === 0,
        progress:
          todoTotals.total > 0
            ? { completed: todoTotals.completed, total: todoTotals.total }
            : undefined,
      });
    }

    if (modules.diaryEnabled && diaryEntriesQuery.data) {
      const { writtenToday, streak } = diaryStatusOf(diaryEntriesQuery.data);
      result.push({
        kind: "diary",
        title: writtenToday ? "今天写过日记了" : "写今天的日记",
        subtitle: streak > 0 ? `已连续 ${streak} 天` : "今天还没写",
        done: writtenToday,
      });
    }

    if (modules.pomodoroEnabled && pomodoroSummaryQuery.data) {
      const { count, focusMs } = pomodoroSummaryQuery.data;
      result.push({
        kind: "pomodoro",
        title: count > 0 ? `今天专注了 ${formatFocusDuration(focusMs)}` : "专注一个番茄",
        subtitle: count > 0 ? `${count} 个番茄` : "今天还没有专注",
        done: count > 0,
      });
    }

    const rank = (item: AgendaItem) =>
      (item.done ? AGENDA_PRIORITY.length : 0) + AGENDA_PRIORITY.indexOf(item.kind);
    return result.sort((a, b) => rank(a) - rank(b));
  }, [
    modules.calendarEnabled,
    modules.diaryEnabled,
    modules.pomodoroEnabled,
    calendarTodayQuery.data,
    flashcardDecksQuery.data,
    flashcardStatsQuery.data,
    todoTotals,
    diaryEntriesQuery.data,
    pomodoroSummaryQuery.data,
  ]);

  const pendingCount = items.filter(item => !item.done).length;
  return { items, pendingCount, todoTotals };
}
