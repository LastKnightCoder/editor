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
export { canonical } from "../content-state-revision";
import { canonical } from "../content-state-revision";
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
    ...(task.priority === undefined ? {} : { priority: task.priority, tags: task.tags }),
    archived: task.archived,
    dueAt: task.dueAt,
    groupId: task.groupId,
    reminderAt: task.reminderAt,
    reminderOffsets: task.reminderOffsets,
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
export function parseSchedule(
  input: { start: string; end: string; allDay: boolean },
  exact = false
) {
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
  const midnight = (date: Date) => new Date(date.getTime()).setHours(0, 0, 0, 0);
  if (!input.allDay)
    for (const date of [first, last]) {
      if (date.getSeconds() || date.getMilliseconds())
        fail("INVALID_ARGUMENT", "日程精确到分钟，请使用整分钟起止时间");
      const restored = new Date(midnight(date));
      restored.setMinutes(date.getHours() * 60 + date.getMinutes());
      if (!exact && restored.getTime() !== date.getTime())
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
