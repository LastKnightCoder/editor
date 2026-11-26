import { useMobileHomeI18n } from "./i18n";
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
import { addDays, formatTime, summarizeToday, todayStart } from "../calendar/utils";
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

export function useTodayAgenda() {
  const { t, locale } = useMobileHomeI18n();
  const todoStatsQuery = useTodoGroupStats();
  const systemGroupsQuery = useTodoSystemGroups();
  const diaryEntriesQuery = useDiaryEntries();
  const flashcardDecksQuery = useFlashcardDecks();
  const flashcardStatsQuery = useFlashcardReviewStats(1);
  const pomodoroSummaryQuery = usePomodoroTodaySummary();
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
    enabled: visibleCalendarIds !== null,
  });

  const todoTotals = useMemo<TodoTotals | null>(() => {
    const allGroupId = (systemGroupsQuery.data ?? []).find(group => group.systemType === "all")?.id;
    const stats = allGroupId != null ? todoStatsQuery.data?.[allGroupId] : undefined;
    if (!stats) return null;
    return {
      total: stats.total,
      uncompleted: stats.uncompleted,
      completed: Math.max(0, stats.total - stats.uncompleted),
    };
  }, [systemGroupsQuery.data, todoStatsQuery.data]);

  const items = useMemo(() => {
    const number = new Intl.NumberFormat(locale);
    const result: AgendaItem[] = [];

    if (calendarTodayQuery.data) {
      const summary = summarizeToday(calendarTodayQuery.data);
      const done = summary.upcoming === 0;
      result.push({
        kind: "calendar",
        title: done
          ? summary.total === 0
            ? t("agenda.noEvents")
            : t("agenda.eventsDone")
          : t("agenda.eventsRemaining", {
              count: summary.upcoming,
              value: number.format(summary.upcoming),
            }),
        subtitle: done
          ? ""
          : summary.next
            ? summary.remaining > 0
              ? t("agenda.nextMore", {
                  label: `${formatTime(summary.next.startTime)} ${summary.next.title}`,
                  value: number.format(summary.remaining),
                })
              : `${formatTime(summary.next.startTime)} ${summary.next.title}`
            : t("agenda.allDay", {
                count: summary.allDayCount,
                value: number.format(summary.allDayCount),
              }),
        done,
      });
    }

    if (flashcardDecksQuery.data) {
      const due = totalDueOf(flashcardDecksQuery.data);
      const reviewed = todayReviewedCount(flashcardStatsQuery.data);
      result.push({
        kind: "flashcard",
        title:
          due > 0
            ? t("agenda.review", { count: due, value: number.format(due) })
            : reviewed > 0
              ? t("agenda.reviewDone")
              : t("agenda.noReviews"),
        subtitle:
          due > 0 || reviewed > 0
            ? t("agenda.reviewed", { count: reviewed, value: number.format(reviewed) })
            : "",
        done: due === 0,
      });
    }

    if (todoTotals) {
      result.push({
        kind: "todo",
        title:
          todoTotals.uncompleted > 0
            ? t("agenda.tasksRemaining", {
                count: todoTotals.uncompleted,
                value: number.format(todoTotals.uncompleted),
              })
            : todoTotals.total > 0
              ? t("agenda.tasksDone")
              : t("agenda.noTasks"),
        subtitle: "",
        done: todoTotals.uncompleted === 0,
        progress:
          todoTotals.total > 0
            ? { completed: todoTotals.completed, total: todoTotals.total }
            : undefined,
      });
    }

    if (diaryEntriesQuery.data) {
      const { writtenToday, streak } = diaryStatusOf(diaryEntriesQuery.data);
      result.push({
        kind: "diary",
        title: writtenToday ? t("agenda.diaryDone") : t("agenda.writeDiary"),
        subtitle:
          streak > 0
            ? t("agenda.streak", { count: streak, value: number.format(streak) })
            : t("agenda.noDiary"),
        done: writtenToday,
      });
    }

    if (pomodoroSummaryQuery.data) {
      const { count, focusMs } = pomodoroSummaryQuery.data;
      result.push({
        kind: "pomodoro",
        title:
          count > 0
            ? t("agenda.focus", { duration: formatFocusDuration(focusMs) })
            : t("agenda.startFocus"),
        subtitle:
          count > 0
            ? t("agenda.sessions", { count, value: number.format(count) })
            : t("agenda.noFocus"),
        done: count > 0,
      });
    }

    const rank = (item: AgendaItem) =>
      (item.done ? AGENDA_PRIORITY.length : 0) + AGENDA_PRIORITY.indexOf(item.kind);
    return result.sort((a, b) => rank(a) - rank(b));
  }, [
    t,
    locale,
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
