import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as calendarCommands from "@/commands/calendar";
import * as groupCommands from "@/commands/calendar-group";
import * as todoCommands from "@/commands/todo";
import * as contentCommands from "@/commands/content";
import { getPomodoroEventBindings } from "@/commands/pomodoro";
import { on } from "@/electron";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import { bindDatabaseCommands } from "@/services/command-context";
import { queryClient } from "@/queryClient";
import {
  getDateStart,
  getDateEnd,
  getMonthGridRange,
  getWeekStart,
  getWeekEnd,
} from "@/utils/calendar";
import type {
  Calendar,
  CalendarGroup,
  CalendarEvent,
  CalendarViewType,
  CreateCalendar,
  UpdateCalendar,
  CreateCalendarGroup,
  CreateCalendarEvent,
  UpdateCalendarEvent,
  PomodoroEventBinding,
  TodoCalendarEventSource,
} from "@/types";
import { useScheduleStore } from "./uiStore";
import {
  buildCalendarKinds,
  buildCalendarRoles,
  type CalendarRole,
  type EventSourceKind,
} from "./eventTone";

const databaseId = (database: string) => database.replace(/\.db$/, "");
export const scheduleKeys = {
  root: (database: string) => ["schedule", databaseId(database)] as const,
  catalog: (database: string) => [...scheduleKeys.root(database), "catalog"] as const,
  events: (database: string, start: number, end: number, ids: number[]) =>
    [...scheduleKeys.root(database), "events", start, end, ids] as const,
  detail: (database: string, id: number | undefined) =>
    [...scheduleKeys.root(database), "detail", id] as const,
  content: (database: string, id: number) =>
    [...scheduleKeys.root(database), "content", id] as const,
  sources: (database: string) => [...scheduleKeys.root(database), "todo-sources"] as const,
  day: (database: string, day: number) => [...scheduleKeys.root(database), "day", day] as const,
  pomodoroBindings: (database: string) =>
    [...scheduleKeys.root(database), "pomodoro-bindings"] as const,
};

export function invalidateSchedule(client: QueryClient, database: string) {
  void client.invalidateQueries({
    queryKey: scheduleKeys.root(database),
    // 备注是表单快照，通知刷新不能覆盖尚未保存的编辑。
    predicate: query => query.queryKey[2] !== "content",
  });
  void client.invalidateQueries({ queryKey: ["home"] });
}

on("schedule:changed", (_event, { databaseName }: { databaseName: string }) => {
  invalidateSchedule(queryClient, databaseName);
});

export function useScheduleCommands() {
  const database = useSettingStore(state => state.setting.database.active);
  const commands = useMemo(
    () =>
      bindDatabaseCommands(
        {
          ...calendarCommands,
          ...groupCommands,
          ...todoCommands,
          ...contentCommands,
          getPomodoroEventBindings,
        },
        { databaseName: database }
      ),
    [database]
  );
  const assertCurrentDatabase = useCallback(() => {
    if (databaseId(useSettingStore.getState().setting.database.active) !== databaseId(database)) {
      throw new Error("数据库已切换，请重新打开日程操作");
    }
  }, [database]);
  return { database, commands, assertCurrentDatabase };
}

interface CalendarCatalog {
  calendars: Calendar[];
  calendarGroups: CalendarGroup[];
}
const EMPTY_CATALOG: CalendarCatalog = { calendars: [], calendarGroups: [] };
const EMPTY_EVENTS: CalendarEvent[] = [];

export function useCalendarCatalog(enabled = true) {
  const { database, commands } = useScheduleCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: scheduleKeys.catalog(database),
    queryFn: async (): Promise<CalendarCatalog> => {
      const [calendars, calendarGroups] = await Promise.all([
        commands.getAllCalendars(),
        commands.getAllCalendarGroups(),
      ]);
      return { calendars, calendarGroups };
    },
    enabled: enabled && connected,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  return {
    ...(query.data ?? EMPTY_CATALOG),
    loading: query.isPending,
    error: query.error,
    retry: query.refetch,
  };
}

function scheduleRange(view: CalendarViewType, date: number) {
  if (view === "day") return { start: getDateStart(date), end: getDateEnd(date) };
  if (view === "week") return { start: getWeekStart(date), end: getWeekEnd(date) };
  const current = new Date(date);
  return getMonthGridRange(current.getFullYear(), current.getMonth() + 1);
}

export function useCalendarEvents() {
  const { database, commands } = useScheduleCommands();
  const connected = useDatabaseConnected();
  const catalog = useCalendarCatalog();
  const currentView = useScheduleStore(state => state.currentView);
  const currentDate = useScheduleStore(state => state.currentDate);
  const ids = catalog.calendars
    .filter(calendar => calendar.visible)
    .map(calendar => calendar.id)
    .sort((a, b) => a - b);
  const { start, end } = scheduleRange(currentView, currentDate);
  const query = useQuery({
    queryKey: scheduleKeys.events(database, start, end, ids),
    queryFn: () => commands.getEventsByDateRange(start, end, ids),
    enabled: connected && !catalog.loading && ids.length > 0,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  return {
    events: ids.length ? (query.data ?? EMPTY_EVENTS) : EMPTY_EVENTS,
    loading: catalog.loading || (ids.length > 0 && query.isPending),
    error: catalog.error ?? query.error,
    retry: catalog.error ? catalog.retry : query.refetch,
  };
}

export function useCalendarEventDetail(id: number | undefined) {
  const { database, commands } = useScheduleCommands();
  const connected = useDatabaseConnected();
  return useQuery({
    queryKey: scheduleKeys.detail(database, id),
    queryFn: () => {
      if (id == null) throw new Error("缺少日程 ID");
      return commands.getCalendarEventById(id);
    },
    enabled: connected && id != null,
    staleTime: 0,
  });
}

export function useEventContent(id: number, enabled: boolean) {
  const { database, commands } = useScheduleCommands();
  const connected = useDatabaseConnected();
  return useQuery({
    queryKey: scheduleKeys.content(database, id),
    queryFn: () => commands.getContentById(id),
    enabled: connected && enabled && id > 0,
    staleTime: 0,
  });
}

export function useScheduleMutations() {
  const client = useQueryClient();
  const { database, commands, assertCurrentDatabase } = useScheduleCommands();
  return useMemo(() => {
    const refresh = () => invalidateSchedule(client, database);
    const findCalendar = (id: number) => {
      const calendar = client
        .getQueryData<CalendarCatalog>(scheduleKeys.catalog(database))
        ?.calendars.find(item => item.id === id);
      if (!calendar) throw new Error("日历已不存在，请刷新后重试");
      return calendar;
    };
    return {
      async createCalendar(input: CreateCalendar) {
        assertCurrentDatabase();
        const result = await commands.createCalendar(input);
        refresh();
        return result;
      },
      async updateCalendar(input: UpdateCalendar) {
        assertCurrentDatabase();
        const result = await commands.updateCalendar(input);
        refresh();
        return result;
      },
      async deleteCalendar(id: number) {
        assertCurrentDatabase();
        const result = await commands.deleteCalendar(id);
        refresh();
        return result;
      },
      async archiveCalendar(id: number) {
        assertCurrentDatabase();
        const result = await commands.updateCalendar({ ...findCalendar(id), archived: true });
        refresh();
        return result;
      },
      async unarchiveCalendar(id: number) {
        assertCurrentDatabase();
        const result = await commands.updateCalendar({ ...findCalendar(id), archived: false });
        refresh();
        return result;
      },
      async toggleCalendarVisibility(id: number) {
        assertCurrentDatabase();
        const calendar = findCalendar(id);
        const result = await commands.updateCalendar({ ...calendar, visible: !calendar.visible });
        client.setQueryData<CalendarCatalog>(scheduleKeys.catalog(database), previous =>
          previous
            ? {
                ...previous,
                calendars: previous.calendars.map(item => (item.id === result.id ? result : item)),
              }
            : previous
        );
        refresh();
      },
      async createCalendarGroup(input: CreateCalendarGroup) {
        assertCurrentDatabase();
        const result = await commands.createCalendarGroup(input);
        refresh();
        return result;
      },
      async deleteCalendarGroup(id: number) {
        assertCurrentDatabase();
        const result = await commands.deleteCalendarGroup(id);
        refresh();
        return result;
      },
      async createEvent(input: CreateCalendarEvent) {
        assertCurrentDatabase();
        const result = await commands.createCalendarEvent(input);
        refresh();
        return result;
      },
      async updateEvent(input: UpdateCalendarEvent) {
        assertCurrentDatabase();
        const result = await commands.updateCalendarEvent(input);
        refresh();
        return result;
      },
      async deleteEvent(id: number) {
        assertCurrentDatabase();
        const result = await commands.deleteCalendarEvent(id);
        if (!result) throw new Error("日程已不存在");
        refresh();
        return result;
      },
      async mergeCalendars(sourceIds: number[], targetId: number) {
        assertCurrentDatabase();
        const result = await commands.mergeCalendars(sourceIds, targetId);
        refresh();
        if (
          databaseId(useSettingStore.getState().setting.database.active) === databaseId(database)
        ) {
          useScheduleStore.setState({ selectedCalendarsForMerge: [], mergeModeEnabled: false });
        }
        return result;
      },
    };
  }, [client, database, commands, assertCurrentDatabase]);
}

/** calendarId → 系统日历角色（番茄钟 / 截止 / 计划 / 周期），随日历与分组变化重算 */
export function useCalendarRoles(): Map<number, CalendarRole> {
  const { calendars, calendarGroups } = useCalendarCatalog();
  return useMemo(() => buildCalendarRoles(calendars, calendarGroups), [calendars, calendarGroups]);
}

/** calendarId → 来源类型（番茄钟 / 待办），随日历与分组变化重算 */
export function useCalendarKinds(): Map<number, EventSourceKind> {
  const { calendars, calendarGroups } = useCalendarCatalog();
  return useMemo(() => buildCalendarKinds(calendars, calendarGroups), [calendars, calendarGroups]);
}

/** 当前可见日程里待办来源那部分的完成状态（eventId → source） */
export function useTodoEventSources(events: CalendarEvent[]) {
  const { database, commands } = useScheduleCommands();
  const connected = useDatabaseConnected();
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
    queryKey: [...scheduleKeys.sources(database), ids],
    queryFn: () => commands.getCalendarEventSources(ids),
    enabled: connected && ids.length > 0,
    staleTime: 30_000,
  });
  return query.data ?? EMPTY_SOURCES;
}

const EMPTY_SOURCES: Record<number, TodoCalendarEventSource> = {};

/** 勾选 / 取消勾选待办日程：普通任务走级联完成，周期任务只动这一次 */
export function useToggleTodoEvent() {
  const queryClient = useQueryClient();
  const { database, commands, assertCurrentDatabase } = useScheduleCommands();
  const mutation = useMutation({
    mutationFn: async (source: TodoCalendarEventSource) => {
      assertCurrentDatabase();
      const next = !source.isCompleted;
      if (source.syncType === "recurring") {
        if (source.recurrenceId == null || source.recurrenceDate == null) return;
        if (next) await commands.completeRecurrence(source.recurrenceId, source.recurrenceDate);
        else await commands.uncompleteRecurrence(source.recurrenceId, source.recurrenceDate);
        return;
      }
      await commands.toggleCompleteCascade(source.todoItemId, next);
    },
    onSuccess: () => invalidateSchedule(queryClient, database),
  });
  return mutation.mutate;
}

/** 某一天的日程（不依赖日程页视图状态，供番茄「专注于…」等域外入口用）；随 schedule:changed 失效 */
export function useEventsOfDay(day: number, enabled = true): CalendarEvent[] {
  const { database, commands } = useScheduleCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: scheduleKeys.day(database, day),
    queryFn: () => commands.getEventsForDay(day),
    enabled: enabled && connected,
    staleTime: 30_000,
  });
  return query.data ?? EMPTY_EVENTS;
}

const EMPTY_BINDINGS: Record<number, PomodoroEventBinding> = {};

/** 可见日程里番茄事件所属会话的绑定（番茄事件 id → 绑定），用于把专注收进绑定事件 */
export function usePomodoroBindings(events: CalendarEvent[]) {
  const { database, commands } = useScheduleCommands();
  const connected = useDatabaseConnected();
  const roles = useCalendarRoles();
  const ids = useMemo(
    () =>
      events
        .filter(e => roles.get(e.calendarId) === "pomodoro")
        .map(e => e.id)
        .sort((a, b) => a - b),
    [events, roles]
  );
  const query = useQuery({
    queryKey: [...scheduleKeys.pomodoroBindings(database), ids],
    queryFn: () => commands.getPomodoroEventBindings(ids),
    enabled: connected && ids.length > 0,
    staleTime: 30_000,
  });
  return query.data ?? EMPTY_BINDINGS;
}
