import { invoke } from "@/electron";
import {
  Calendar,
  CalendarEvent,
  CreateCalendar,
  UpdateCalendar,
  CreateCalendarEvent,
  UpdateCalendarEvent,
} from "@/types/calendar";

// 日历管理
export const createCalendar = async (
  calendar: CreateCalendar,
): Promise<Calendar> => {
  return await invoke("calendar:create", calendar);
};

export const updateCalendar = async (
  calendar: UpdateCalendar,
): Promise<Calendar> => {
  return await invoke("calendar:update", calendar);
};

export const deleteCalendar = async (id: number): Promise<number> => {
  return await invoke("calendar:delete", id);
};

export const getCalendarById = async (id: number): Promise<Calendar> => {
  return await invoke("calendar:get-by-id", id);
};

export const getAllCalendars = async (): Promise<Calendar[]> => {
  return await invoke("calendar:get-all");
};

export const getVisibleCalendars = async (): Promise<Calendar[]> => {
  return await invoke("calendar:get-visible");
};

// 事件管理
export const createCalendarEvent = async (
  event: CreateCalendarEvent,
): Promise<CalendarEvent> => {
  return await invoke("calendar-event:create", event);
};

export const updateCalendarEvent = async (
  event: UpdateCalendarEvent,
): Promise<CalendarEvent> => {
  return await invoke("calendar-event:update", event);
};

export const deleteCalendarEvent = async (id: number): Promise<number> => {
  return await invoke("calendar-event:delete", id);
};

export const getCalendarEventById = async (
  id: number,
): Promise<CalendarEvent> => {
  return await invoke("calendar-event:get-by-id", id);
};

export const getEventsByCalendarId = async (
  calendarId: number,
): Promise<CalendarEvent[]> => {
  return await invoke("calendar-event:get-by-calendar-id", calendarId);
};

export const getEventsByDateRange = async (
  startDate: number,
  endDate: number,
  calendarIds?: number[],
): Promise<CalendarEvent[]> => {
  return await invoke(
    "calendar-event:get-by-date-range",
    startDate,
    endDate,
    calendarIds,
  );
};

export const getEventsForDay = async (
  date: number,
  calendarIds?: number[],
): Promise<CalendarEvent[]> => {
  return await invoke("calendar-event:get-for-day", date, calendarIds);
};

export const getEventsForWeek = async (
  startDate: number,
  calendarIds?: number[],
): Promise<CalendarEvent[]> => {
  return await invoke("calendar-event:get-for-week", startDate, calendarIds);
};

export const getEventsForMonth = async (
  year: number,
  month: number,
  calendarIds?: number[],
): Promise<CalendarEvent[]> => {
  return await invoke("calendar-event:get-for-month", year, month, calendarIds);
};

export const mergeCalendars = async (
  sourceCalendarIds: number[],
  targetCalendarId: number,
): Promise<{ transferredEvents: number; deletedCalendars: number }> => {
  return await invoke("calendar:merge", sourceCalendarIds, targetCalendarId);
};
