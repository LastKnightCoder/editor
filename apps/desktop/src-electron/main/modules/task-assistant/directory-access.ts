import type Database from "better-sqlite3";
import CalendarTable from "../tables/calendar";
import TodoGroupTable from "../tables/todo-group";
import { fail } from "./common";

export function requireGroup(db: Database.Database, id: number): void {
  if (!TodoGroupTable.isWritable(db, id)) fail("NOT_FOUND", "待办项目不存在或已归档");
}
export function requireCalendar(db: Database.Database, id?: number): number {
  const calendarId = CalendarTable.findWritableUserCalendarId(db, id);
  if (calendarId === null) return fail("INVALID_CALENDAR", "请先选择或创建一个可写用户日历");
  return calendarId;
}
