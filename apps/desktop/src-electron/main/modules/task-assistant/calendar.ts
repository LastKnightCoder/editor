import type Database from "better-sqlite3";
import type {
  AssistantCalendarEvent,
  TaskOccurrenceRef,
  TaskRef,
} from "@tau/shared/task-assistant";
import CalendarEventTable from "../tables/calendar-event";
import {
  checkRevision,
  fail,
  localDate,
  parseSchedule,
  requireCalendar,
  revision,
  type Row,
} from "./common";
import { captureEvents } from "./snapshots";

export function readCalendarEvent(db: Database.Database, id: number): AssistantCalendarEvent {
  const row = db.prepare("SELECT * FROM calendar_event WHERE id=?").get(id) as Row | undefined;
  if (!row) return fail("NOT_FOUND", "日程已删除");
  const link = db
    .prepare("SELECT * FROM doc_task_calendar_link WHERE calendar_event_id=?")
    .get(id) as Row | undefined;
  const occurrence = db
    .prepare(
      "SELECT series_id,occurrence_date FROM todo_schedule_occurrence WHERE calendar_event_id=?"
    )
    .get(id) as Row | undefined;
  const todoId =
    row.todo_item_id ??
    (
      db
        .prepare("SELECT todo_item_id FROM todo_calendar_mapping WHERE calendar_event_id=?")
        .get(id) as { todo_item_id: number } | undefined
    )?.todo_item_id;
  const todo = todoId
    ? (db.prepare("SELECT create_time FROM todo_item WHERE id=?").get(todoId) as
        { create_time: number } | undefined)
    : undefined;
  const ref: TaskRef | undefined = link
    ? {
        kind: "document",
        contentId: Number(link.content_id),
        createdAt: Number(link.content_created_at),
        taskId: String(link.task_id),
      }
    : todo
      ? { kind: "todo", todoId: Number(todoId), createdAt: todo.create_time }
      : undefined;
  const start = new Date(Number(row.start_date));
  const end = new Date(Number(row.end_date ?? row.start_date));
  if (row.all_day) end.setDate(end.getDate() + 1);
  else {
    start.setMinutes(Number(row.start_time ?? 0));
    end.setMinutes(Number(row.end_time ?? 0));
  }
  let writable = true;
  try {
    requireCalendar(db, Number(row.calendar_id));
  } catch {
    writable = false;
  }
  return {
    eventId: id,
    createdAt: Number(row.create_time),
    revision: revision(captureEvents(db, [id])),
    title: String(row.title),
    calendarId: Number(row.calendar_id),
    start: row.all_day ? localDate(start) : start.toISOString(),
    end: row.all_day ? localDate(end) : end.toISOString(),
    allDay: !!row.all_day,
    ...(ref ? { taskRef: ref } : {}),
    ...((link ?? occurrence)?.series_id && (link ?? occurrence)?.occurrence_date
      ? {
          occurrence: {
            seriesId: String((link ?? occurrence)!.series_id),
            occurrenceDate: String((link ?? occurrence)!.occurrence_date),
          },
        }
      : {}),
    writable,
  };
}

export function createEvent(
  db: Database.Database,
  input: {
    title?: string;
    calendarId?: number;
    start: string;
    end: string;
    allDay: boolean;
    taskRef?: TaskRef;
    occurrence?: TaskOccurrenceRef;
  },
  taskTitle?: string
) {
  const calendarId = requireCalendar(db, input.calendarId);
  const title = taskTitle ?? input.title;
  if (!title) return fail("INVALID_ARGUMENT", "独立日程必须有标题");
  const event = CalendarEventTable.createEvent(db, {
    calendarId,
    title,
    ...parseSchedule(input),
    detailContentId: 0,
    color: null,
    todoItemId: input.taskRef?.kind === "todo" ? input.taskRef.todoId : null,
  });
  if (input.taskRef?.kind === "document") {
    const ref = input.taskRef;
    db.prepare("INSERT INTO doc_task_calendar_link VALUES (?,?,?,?,?,?,?)").run(
      event.id,
      ref.contentId,
      ref.createdAt,
      ref.taskId,
      input.occurrence?.seriesId ?? null,
      input.occurrence?.occurrenceDate ?? null,
      Date.now()
    );
  }
  if (input.taskRef?.kind === "todo" && input.occurrence)
    db.prepare("INSERT INTO todo_schedule_occurrence VALUES (?,?,?)").run(
      event.id,
      input.occurrence.seriesId,
      input.occurrence.occurrenceDate
    );
  return readCalendarEvent(db, event.id);
}

export function mutateEvent(
  db: Database.Database,
  input: { eventId: number; createdAt: number; revision: string; patch?: Record<string, unknown> },
  remove: boolean
) {
  const previous = readCalendarEvent(db, input.eventId);
  if (previous.createdAt !== input.createdAt) fail("NOT_FOUND", "日程身份已变化");
  checkRevision(input.revision, previous.revision);
  if (!previous.writable) fail("READ_ONLY", "系统任务标记请通过待办工具修改");
  if (remove) {
    CalendarEventTable.deleteEvent(db, input.eventId);
    db.prepare("DELETE FROM doc_task_calendar_link WHERE calendar_event_id=?").run(input.eventId);
    return { deleted: previous };
  }
  const patch = input.patch!;
  if (!patch || !Object.keys(patch).length) fail("INVALID_ARGUMENT", "修改字段不能为空");
  if (patch.title !== undefined && previous.taskRef)
    fail("INVALID_ARGUMENT", "关联安排的标题跟随待办，请修改待办标题");
  const next = { ...previous, ...patch } as AssistantCalendarEvent;
  requireCalendar(db, next.calendarId);
  const stored = CalendarEventTable.getEventById(db, input.eventId);
  CalendarEventTable.updateEvent(db, {
    ...stored,
    title: next.title,
    calendarId: next.calendarId,
    ...parseSchedule(next),
  });
  return readCalendarEvent(db, input.eventId);
}

export function documentEventIds(
  db: Database.Database,
  ref: Extract<TaskRef, { kind: "document" }>
): number[] {
  return (
    db
      .prepare(
        "SELECT calendar_event_id FROM doc_task_calendar_link WHERE content_id=? AND content_created_at=? AND task_id=?"
      )
      .all(ref.contentId, ref.createdAt, ref.taskId) as { calendar_event_id: number }[]
  ).map(row => row.calendar_event_id);
}
export function syncDocumentSchedules(
  db: Database.Database,
  ref: Extract<TaskRef, { kind: "document" }>,
  title: string | null
) {
  for (const id of documentEventIds(db, ref)) {
    const row = db.prepare("SELECT * FROM calendar_event WHERE id=?").get(id) as Row | undefined;
    if (!row) {
      db.prepare("DELETE FROM doc_task_calendar_link WHERE calendar_event_id=?").run(id);
      continue;
    }
    if (title !== null)
      db.prepare("UPDATE calendar_event SET title=?,update_time=? WHERE id=? AND title<>?").run(
        title,
        Date.now(),
        id,
        title
      );
    else {
      const start =
        Number(row.start_date) + (row.all_day ? 0 : Number(row.start_time ?? 0) * 60_000);
      if (start > Date.now()) CalendarEventTable.deleteEvent(db, id);
      db.prepare("DELETE FROM doc_task_calendar_link WHERE calendar_event_id=?").run(id);
    }
  }
}
