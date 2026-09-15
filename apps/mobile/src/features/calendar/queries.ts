// 日历域查询 hooks：组件订阅 query 缓存，写操作后 invalidateCalendarQueries 驱动刷新
// （对齐 flashcard/queries.ts 范式）；范围查询以 [start, end] 参数化为 key。

import { useQuery } from "@tanstack/react-query";
import * as tauri from "../../services/tauri";
export { invalidateCalendarQueries } from "./cache";

const CALENDAR_STALE_MS = 30_000;

export function useCalendars() {
  return useQuery({
    queryKey: ["calendar", "calendars"],
    queryFn: () => tauri.calendarGetAll(),
    staleTime: CALENDAR_STALE_MS,
  });
}

export function useCalendarEventsByRange(params: {
  startDate: number;
  endDate: number;
  calendarIds: number[];
  /** 模块关闭时不发查询（Bento 卡按模块开关隐藏） */
  enabled?: boolean;
}) {
  const { startDate, endDate, calendarIds, enabled = true } = params;
  const timeZone = tauri.localTimeZone();
  return useQuery({
    queryKey: ["calendar", "events", startDate, endDate, calendarIds, timeZone],
    queryFn: () =>
      tauri.calendarEventGetByDateRange({
        startDate,
        endDate,
        calendarIds,
        timeZone,
      }),
    staleTime: CALENDAR_STALE_MS,
    enabled,
  });
}

export function useCalendarEventById(eventId: number) {
  return useQuery({
    queryKey: ["calendar", "event", eventId],
    queryFn: () => tauri.calendarEventGetById(eventId),
    staleTime: CALENDAR_STALE_MS,
  });
}
