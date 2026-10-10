import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  occurrenceKey,
  taskOccurrencesInRange as occurrences,
  type TaskOccurrenceRef,
  type TaskOccurrenceState,
  type TaskRecurrenceRule,
  type TaskRecurrenceSegment,
  type TaskRef,
} from "@tau/shared/task-assistant";
export { taskOccurrencesInRange as occurrences } from "@tau/shared/task-assistant";
import TodoRecurrenceTable from "../tables/todo-recurrence";
import { dateTime, fail, localDate } from "./common";

export function independentSegments(
  db: Database.Database,
  ref: Extract<TaskRef, { kind: "todo" }>
): TaskRecurrenceSegment[] {
  const rows = db
    .prepare(
      "SELECT * FROM todo_recurrence_history WHERE todo_item_id=? AND todo_created_at=? ORDER BY effective_date"
    )
    .all(ref.todoId, ref.createdAt) as Array<{
    series_id: string;
    effective_date: string;
    rule_json: string | null;
  }>;
  if (rows.length)
    return rows.map(row => ({
      seriesId: row.series_id,
      effectiveDate: row.effective_date,
      rule: row.rule_json ? JSON.parse(row.rule_json) : null,
    }));
  const oldRow = db.prepare("SELECT * FROM todo_recurrence WHERE todo_item_id=?").get(ref.todoId);
  const old = oldRow ? TodoRecurrenceTable.parse(oldRow) : null;
  if (!old) return [];
  return [
    {
      seriesId: `recurrence:${old.id}:${old.createTime}`,
      effectiveDate: localDate(old.startDate),
      rule: {
        type: old.type,
        interval: old.interval,
        startDate: localDate(old.startDate),
        endDate: old.endDate == null ? null : localDate(old.endDate),
        weekdays: old.weekdays ?? undefined,
        monthDay: old.monthDay ?? undefined,
        yearMonth: old.yearMonth ?? undefined,
        yearDay: old.yearDay ?? undefined,
        excludeHolidays: old.excludeHolidays,
        maxOccurrences: old.maxOccurrences,
      },
    },
  ];
}

export function amendSegments(
  segments: TaskRecurrenceSegment[],
  effectiveDate: string,
  rule: TaskRecurrenceRule | null
): TaskRecurrenceSegment[] {
  if (rule?.endDate && rule.endDate < rule.startDate)
    fail("INVALID_ARGUMENT", "重复规则结束日期早于开始日期");
  if (segments.some(segment => segment.effectiveDate > effectiveDate))
    fail("VERSION_CONFLICT", "已有更晚生效的规则，请先明确要修改的区间");
  return [
    ...segments.filter(segment => segment.effectiveDate < effectiveDate),
    {
      seriesId:
        segments.find(segment => segment.effectiveDate === effectiveDate)?.seriesId ?? randomUUID(),
      effectiveDate,
      rule,
    },
  ];
}

export function storeSegments(
  db: Database.Database,
  ref: Extract<TaskRef, { kind: "todo" }>,
  segments: TaskRecurrenceSegment[]
) {
  db.prepare("DELETE FROM todo_recurrence_history WHERE todo_item_id=? AND todo_created_at=?").run(
    ref.todoId,
    ref.createdAt
  );
  const insert = db.prepare("INSERT INTO todo_recurrence_history VALUES (?,?,?,?,?,?)");
  for (const segment of segments)
    insert.run(
      segment.seriesId,
      ref.todoId,
      ref.createdAt,
      segment.effectiveDate,
      segment.rule ? JSON.stringify(segment.rule) : null,
      Date.now()
    );
  const current =
    [...segments].reverse().find(segment => segment.effectiveDate <= localDate(Date.now())) ??
    segments[0];
  if (current?.rule) {
    const rule = current.rule;
    const old = TodoRecurrenceTable.getRecurrenceByItemId(db, { todoItemId: ref.todoId });
    const input = {
      ...rule,
      startDate: dateTime(rule.startDate),
      endDate: rule.endDate ? dateTime(rule.endDate) : null,
    };
    if (old)
      TodoRecurrenceTable.updateRecurrence(db, { id: old.id, ...input }, { preserveHistory: true });
    else
      TodoRecurrenceTable.createRecurrence(
        db,
        { todoItemId: ref.todoId, ...input },
        { preserveHistory: true }
      );
    db.prepare("UPDATE todo_item SET type='recurring',update_time=? WHERE id=?").run(
      Date.now(),
      ref.todoId
    );
  }
}

export function independentStates(
  db: Database.Database,
  ref: Extract<TaskRef, { kind: "todo" }>
): Record<string, TaskOccurrenceState> {
  const result: Record<string, TaskOccurrenceState> = {};
  const oldRow = db.prepare("SELECT * FROM todo_recurrence WHERE todo_item_id=?").get(ref.todoId);
  const old = oldRow ? TodoRecurrenceTable.parse(oldRow) : null;
  if (old) {
    const rows = db
      .prepare("SELECT * FROM todo_recurrence_completion WHERE recurrence_id=?")
      .all(old.id) as Array<{
      scheduled_date: number;
      completed_at: number | null;
      skipped: number;
    }>;
    const segments = independentSegments(db, ref);
    for (const row of rows) {
      const day = localDate(row.scheduled_date);
      const segment = [...segments].reverse().find(entry => entry.effectiveDate <= day);
      if (segment)
        result[occurrenceKey({ seriesId: segment.seriesId, occurrenceDate: day })] = {
          completedAt: row.completed_at,
          skipped: !!row.skipped,
        };
    }
  }
  for (const row of db
    .prepare("SELECT * FROM todo_occurrence_override WHERE todo_item_id=? AND todo_created_at=?")
    .all(ref.todoId, ref.createdAt) as Array<{
    series_id: string;
    occurrence_date: string;
    state_json: string;
  }>) {
    result[occurrenceKey({ seriesId: row.series_id, occurrenceDate: row.occurrence_date })] =
      JSON.parse(row.state_json);
  }
  return result;
}

export function assertOccurrence(
  segments: TaskRecurrenceSegment[],
  occurrence: TaskOccurrenceRef,
  holidays?: Set<number>
) {
  if (segments.some(segment => segment.rule?.excludeHolidays) && !holidays)
    fail("HOLIDAY_DATA_UNAVAILABLE", "节假日数据尚未就绪");
  if (
    !occurrences(segments, {}, occurrence.occurrenceDate, occurrence.occurrenceDate, holidays).some(
      entry => entry.occurrence.seriesId === occurrence.seriesId
    )
  )
    fail("NOT_FOUND", "指定周期实例不存在或已被规则修改");
}
