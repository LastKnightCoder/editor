import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import {
  TaskAssistantError,
  type TaskRef,
  type AssistantTask,
  type TaskOccurrenceRef,
  type TaskOccurrenceState,
} from "@tau/shared/task-assistant";

export type Row = Record<string, string | number | null>;
export const fail = (code: string, message: string): never => {
  throw new TaskAssistantError(code, message);
};
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const revision = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export function instanceRevision(
  task: AssistantTask,
  occurrence: TaskOccurrenceRef,
  state: TaskOccurrenceState
) {
  return revision({
    taskRef: task.taskRef,
    title: task.title,
    archived: task.archived,
    dueAt: task.dueAt,
    groupId: task.groupId,
    reminderAt: task.reminderAt,
    recurrence: task.recurrence,
    occurrence,
    state,
  });
}
export const localDate = (time: number | Date) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export const dateTime = (value: string) =>
  new Date(value.length === 10 ? `${value}T00:00:00` : value).getTime();
export const afterDate = (value: string) => {
  const date = new Date(dateTime(value));
  date.setDate(date.getDate() + 1);
  return date.getTime();
};
export function todoRow(db: Database.Database, ref: TaskRef): Row {
  if (ref.kind !== "todo") return fail("INVALID_ARGUMENT", "需要独立待办身份");
  const row = db.prepare("SELECT * FROM todo_item WHERE id=?").get(ref.todoId) as Row | undefined;
  if (!row || row.create_time !== ref.createdAt) return fail("NOT_FOUND", "待办已删除或身份已变化");
  return row;
}
export const refOfTodo = (row: Row): TaskRef => ({
  kind: "todo",
  todoId: Number(row.id),
  createdAt: Number(row.create_time),
});
export function checkRevision(expected: unknown, actual: string): void {
  if (expected !== actual) fail("VERSION_CONFLICT", "对象已变化，请重新查询后重试");
}
export function requireGroup(db: Database.Database, id: number): void {
  if (!db.prepare("SELECT id FROM todo_group WHERE id=? AND is_archived=0").get(id))
    fail("NOT_FOUND", "待办项目不存在或已归档");
}
export function requireCalendar(db: Database.Database, id?: number): number {
  const row = db
    .prepare(
      `WITH RECURSIVE system_groups(id) AS (
    SELECT id FROM calendar_group WHERE is_system=1
    UNION SELECT g.id FROM calendar_group g JOIN system_groups s ON g.parent_group_id=s.id
  ) SELECT c.id FROM calendar c
    WHERE c.archived=0 AND (c.group_id IS NULL OR c.group_id NOT IN (SELECT id FROM system_groups)) ${id === undefined ? "" : "AND c.id=?"}
    ORDER BY c.order_index,c.id LIMIT 1`
    )
    .get(...(id === undefined ? [] : [id])) as { id: number } | undefined;
  if (!row) return fail("INVALID_CALENDAR", "请先选择或创建一个可写用户日历");
  return row.id;
}
export function parseSchedule(input: { start: string; end: string; allDay: boolean }) {
  const start = dateTime(input.start),
    end = dateTime(input.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    fail("INVALID_ARGUMENT", "结束时间必须晚于开始时间；全天结束日期为不包含的下一天");
  if (input.allDay && (input.start.length !== 10 || input.end.length !== 10))
    fail("INVALID_ARGUMENT", "全天安排须使用日期");
  if (!input.allDay && (input.start.length === 10 || input.end.length === 10))
    fail("INVALID_ARGUMENT", "定时安排须提供带时区的起止时间");
  const first = new Date(start),
    last = new Date(input.allDay ? end - 1 : end);
  const midnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (!input.allDay)
    for (const date of [first, last]) {
      if (date.getSeconds() || date.getMilliseconds())
        fail("INVALID_ARGUMENT", "日程精确到分钟，请使用整分钟起止时间");
      const restored = new Date(midnight(date));
      restored.setMinutes(date.getHours() * 60 + date.getMinutes());
      if (restored.getTime() !== date.getTime())
        fail("AMBIGUOUS_TIME", "该时刻处于夏令时重复区间，当前日程格式无法无歧义保存");
    }
  return {
    startDate: midnight(first),
    endDate: midnight(last),
    startTime: input.allDay ? null : first.getHours() * 60 + first.getMinutes(),
    endTime: input.allDay ? null : last.getHours() * 60 + last.getMinutes(),
    allDay: input.allDay,
  };
}

export function checkedWindow(start: string, end: string): [number, number] {
  const from = dateTime(start),
    to = dateTime(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 366 * 86_400_000)
    fail("INVALID_ARGUMENT", "查询窗口须在 0–366 天内");
  return [from, to];
}
