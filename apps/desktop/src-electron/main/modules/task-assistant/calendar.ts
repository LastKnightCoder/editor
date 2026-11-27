import { requireCalendar } from "./directory-access";
import type Database from "better-sqlite3";
import type {
  AssistantCalendarEvent,
  TaskOccurrenceRef,
  TaskRef,
} from "@tau/shared/task-assistant";
import ContentTable from "../tables/content";
import ItemReminderTable from "../tables/item-reminder";
import { pluginContentRevision } from "../tables/plugin-content-write";
import CalendarTable from "../tables/calendar";
import CalendarEventTable from "../tables/calendar-event";
import { checkRevision, fail, localDate, parseSchedule, revision, type Row } from "./common";

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
        | { create_time: number }
        | undefined)
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
  if (row.start_utc_ms != null) {
    start.setTime(Number(row.start_utc_ms));
    end.setTime(Number(row.end_utc_ms ?? row.start_utc_ms));
  } else if (row.all_day) end.setDate(end.getDate() + 1);
  else {
    start.setMinutes(Number(row.start_time ?? 0));
    end.setMinutes(Number(row.end_time ?? 0));
  }
  const writable = CalendarTable.getDirectoryItem(db, Number(row.calendar_id))?.writable ?? false;
  const reminders = ItemReminderTable.list(db, "event", id);
  const notes = Number(row.detail_content_id)
    ? ContentTable.getContentById(db, Number(row.detail_content_id))
    : null;
  const zones = row.start_time_zone
    ? {
        startTimeZone: String(row.start_time_zone),
        ...(row.end_time_zone ? { endTimeZone: String(row.end_time_zone) } : {}),
      }
    : {};
  return {
    ...zones,
    reminderOffsets: reminders,
    ...(notes ? { notes: { contentId: notes.id, createdAt: notes.createTime } } : {}),
    eventId: id,
    createdAt: Number(row.create_time),
    revision: revision({
      title: row.title,
      calendarId: row.calendar_id,
      ...zones,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: !!row.all_day,
      reminders,
      notes: notes ? pluginContentRevision(notes) : null,
      ref,
      occurrence,
      writable,
    }),
    title: String(row.title),
    calendarId: Number(row.calendar_id),
    start: row.all_day ? localDate(start) : start.toISOString(),
    end: row.all_day ? localDate(end) : end.toISOString(),
    allDay: !!row.all_day,
    ...(ref ? { taskRef: ref } : {}),
    ...((): { occurrence?: { seriesId: string; occurrenceDate: string } } => {
      const series = link ?? occurrence;
      return series?.series_id && series?.occurrence_date
        ? {
            occurrence: {
              seriesId: String(series.series_id),
              occurrenceDate: String(series.occurrence_date),
            },
          }
        : {};
    })(),
    writable,
  };
}

export function createEvent(
  db: Database.Database,
  input: {
    title?: string;
    calendarId?: number;
    startTimeZone?: string;
    endTimeZone?: string;
    start: string;
    end: string;
    allDay: boolean;
    taskRef?: TaskRef;
    occurrence?: TaskOccurrenceRef;
    reminderOffsets?: number[];
  },
  taskTitle?: string,
  notes?: Pick<import("@/types/content").IContent, "content" | "contracts">
) {
  const calendarId = requireCalendar(db, input.calendarId);
  const title = taskTitle ?? input.title;
  if (!title) return fail("INVALID_ARGUMENT", "独立日程必须有标题");
  if ((input.taskRef || input.allDay) && (input.startTimeZone || input.endTimeZone))
    fail("INVALID_ARGUMENT", "只有独立定时日程可以指定时区");
  const event = CalendarEventTable.createEvent(
    db,
    {
      calendarId,
      title,
      ...parseSchedule(input, !input.taskRef),
      detailContentId: notes ? ContentTable.createContent(db, notes) : 0,
      color: null,
      todoItemId: input.taskRef?.kind === "todo" ? input.taskRef.todoId : null,
    },
    input.taskRef
      ? false
      : { ...input, startInstant: Date.parse(input.start), endInstant: Date.parse(input.end) }
  );
  if (input.reminderOffsets !== undefined)
    ItemReminderTable.replace(db, "event", event.id, input.reminderOffsets);
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
  remove: boolean,
  preparedNotes?: Pick<import("@/types/content").IContent, "content" | "contracts">
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
  const patch = input.patch;
  if (!patch || !Object.keys(patch).length) return fail("INVALID_ARGUMENT", "修改字段不能为空");
  if (patch.title !== undefined && previous.taskRef)
    fail("INVALID_ARGUMENT", "关联安排的标题跟随待办，请修改待办标题");
  const next = { ...previous, ...patch } as AssistantCalendarEvent;
  if ((previous.taskRef || next.allDay) && (patch.startTimeZone || patch.endTimeZone))
    fail("INVALID_ARGUMENT", "只有独立定时日程可以指定时区");
  requireCalendar(db, next.calendarId);
  const stored = CalendarEventTable.getEventById(db, input.eventId);
  if (!stored) fail("NOT_FOUND", "日程已删除");
  if (patch.ensureNotes && !stored.detailContentId) {
    stored.detailContentId = ContentTable.createContent(
      db,
      preparedNotes ?? fail("INVALID_ARGUMENT", "备注正文尚未准备")
    );
  }
  CalendarEventTable.updateEvent(
    db,
    {
      ...stored,
      title: next.title,
      calendarId: next.calendarId,
      ...(["start", "end", "allDay"].some(key => patch[key] !== undefined)
        ? parseSchedule(next, !previous.taskRef)
        : {}),
    },
    previous.taskRef
      ? false
      : !next.allDay &&
          (previous.startTimeZone ||
            patch.start ||
            patch.end ||
            patch.startTimeZone ||
            patch.endTimeZone)
        ? {
            startInstant: Date.parse(next.start),
            endInstant: Date.parse(next.end),
            startTimeZone: next.startTimeZone,
            endTimeZone: next.endTimeZone,
          }
        : undefined
  );
  if (patch.reminderOffsets !== undefined)
    ItemReminderTable.replace(db, "event", input.eventId, patch.reminderOffsets as number[]);
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
