/**
 * 日程页数据：日历/日程本体仍由 useCalendarStore 承载（第一版不动数据层），
 * 这里只补待办来源日程的完成状态——批量查询 + 勾选完成。
 */

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeRecurrence,
  getCalendarEventSources,
  toggleCompleteCascade,
  uncompleteRecurrence,
} from "@/commands/todo";
import useCalendarStore from "@/stores/useCalendarStore";
import type { CalendarEvent, TodoCalendarEventSource } from "@/types";
import { buildCalendarKinds, type EventSourceKind } from "./eventTone";

const SOURCES_KEY = ["schedule", "todo-sources"] as const;

/** calendarId → 来源类型（番茄钟 / 待办），随日历与分组变化重算 */
export function useCalendarKinds(): Map<number, EventSourceKind> {
  const calendars = useCalendarStore(s => s.calendars);
  const groups = useCalendarStore(s => s.calendarGroups);
  return useMemo(() => buildCalendarKinds(calendars, groups), [calendars, groups]);
}

/** 当前可见日程里待办来源那部分的完成状态（eventId → source） */
export function useTodoEventSources(events: CalendarEvent[]) {
  const kinds = useCalendarKinds();
  const ids = useMemo(
    () =>
      events
        .filter(e => kinds.get(e.calendarId) === "todo")
        .map(e => e.id)
        .sort((a, b) => a - b),
    [events, kinds]
  );
  const query = useQuery({
    queryKey: [...SOURCES_KEY, ids],
    queryFn: () => getCalendarEventSources(ids),
    enabled: ids.length > 0,
    staleTime: 30_000,
  });
  return query.data ?? EMPTY_SOURCES;
}

const EMPTY_SOURCES: Record<number, TodoCalendarEventSource> = {};

/** 勾选 / 取消勾选待办日程：普通任务走级联完成，周期任务只动这一次 */
export function useToggleTodoEvent() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (source: TodoCalendarEventSource) => {
      const next = !source.isCompleted;
      if (source.syncType === "recurring") {
        if (source.recurrenceId == null || source.recurrenceDate == null) return;
        if (next) await completeRecurrence(source.recurrenceId, source.recurrenceDate);
        else await uncompleteRecurrence(source.recurrenceId, source.recurrenceDate);
        return;
      }
      await toggleCompleteCascade(source.todoItemId, next);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
  return mutation.mutate;
}
