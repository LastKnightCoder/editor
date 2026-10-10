import Database from "better-sqlite3";
import { taskOccurrencesInRange } from "@tau/shared/task-assistant";
import {
  amendSegments,
  independentSegments,
  independentStates,
} from "../task-assistant/recurrence";
import { localDate } from "../task-assistant/common";
import {
  calendarOccurrencesInRange,
  nextCalendarOccurrence,
} from "@tau/shared/src/utils/calendarRecurrence";
import {
  TodoRecurrence,
  CreateTodoRecurrence,
  UpdateTodoRecurrence,
  RecurrenceType,
} from "@/types";

export default class TodoRecurrenceTable {
  static withHistory(db: Database.Database, row: any): TodoRecurrence {
    const value = this.parse(row);
    const owner = db
      .prepare("SELECT create_time FROM todo_item WHERE id=?")
      .get(value.todoItemId) as { create_time: number } | undefined;
    if (!owner) return value;
    const ref = { kind: "todo" as const, todoId: value.todoItemId, createdAt: owner.create_time };
    return {
      ...value,
      segments: independentSegments(db, ref),
      occurrenceState: independentStates(db, ref),
    };
  }
  static getListenEvents() {
    return {
      "todo:get-recurrence": this.getRecurrence.bind(this),
      "todo:get-recurrence-by-item": this.getRecurrenceByItemId.bind(this),
      "todo:get-recurrences-by-item-ids": this.getRecurrencesByItemIds.bind(this),
      "todo:create-recurrence": this.createRecurrence.bind(this),
      "todo:update-recurrence": this.updateRecurrence.bind(this),
      "todo:delete-recurrence": this.deleteRecurrence.bind(this),
      "todo:delete-recurrence-by-item": this.deleteRecurrenceByItemId.bind(this),
    } as const;
  }

  static parse(row: any): TodoRecurrence {
    return {
      id: row.id,
      todoItemId: row.todo_item_id,
      type: row.type as RecurrenceType,
      interval: row.interval,
      weekdays: row.weekdays ? JSON.parse(row.weekdays) : null,
      monthDay: row.month_day ?? null,
      yearMonth: row.year_month ?? null,
      yearDay: row.year_day ?? null,
      excludeHolidays: Boolean(row.exclude_holidays),
      startDate: row.start_date,
      endDate: row.end_date ?? null,
      maxOccurrences: row.max_occurrences ?? null,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static getRecurrence(db: Database.Database, params: { id: number }): TodoRecurrence | null {
    const row = db.prepare(`SELECT * FROM todo_recurrence WHERE id = ?`).get(params.id);
    return row ? this.withHistory(db, row) : null;
  }

  static getRecurrenceByItemId(
    db: Database.Database,
    params: { todoItemId: number }
  ): TodoRecurrence | null {
    const row = db
      .prepare(`SELECT * FROM todo_recurrence WHERE todo_item_id = ?`)
      .get(params.todoItemId);
    return row ? this.withHistory(db, row) : null;
  }

  static getRecurrencesByItemIds(
    db: Database.Database,
    params: { todoItemIds: number[] }
  ): Record<number, TodoRecurrence> {
    if (!params.todoItemIds.length) {
      return {};
    }

    const placeholders = params.todoItemIds.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT * FROM todo_recurrence WHERE todo_item_id IN (${placeholders})`)
      .all(...params.todoItemIds) as any[];

    return rows.reduce<Record<number, TodoRecurrence>>((acc, row) => {
      const recurrence = this.withHistory(db, row);
      acc[recurrence.todoItemId] = recurrence;
      return acc;
    }, {});
  }

  static createRecurrence(
    db: Database.Database,
    payload: CreateTodoRecurrence,
    options: { preserveHistory?: boolean } = {}
  ): TodoRecurrence {
    const now = Date.now();
    const stmt = db.prepare(
      `INSERT INTO todo_recurrence (todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const res = stmt.run(
      payload.todoItemId,
      payload.type,
      payload.interval ?? 1,
      payload.weekdays ? JSON.stringify(payload.weekdays) : null,
      payload.monthDay ?? null,
      payload.yearMonth ?? null,
      payload.yearDay ?? null,
      payload.excludeHolidays ? 1 : 0,
      payload.startDate,
      payload.endDate ?? null,
      payload.maxOccurrences ?? null,
      now,
      now
    );

    const id = Number(res.lastInsertRowid);
    if (
      !options.preserveHistory &&
      db
        .prepare("SELECT 1 FROM todo_recurrence_history WHERE todo_item_id=?")
        .get(payload.todoItemId)
    )
      return this.updateRecurrence(db, { id });
    return this.getRecurrence(db, { id })!;
  }

  static updateRecurrence(
    db: Database.Database,
    payload: UpdateTodoRecurrence,
    options: { preserveHistory?: boolean } = {}
  ): TodoRecurrence {
    const now = Date.now();
    const cur = db.prepare(`SELECT * FROM todo_recurrence WHERE id = ?`).get(payload.id) as any;

    if (!cur) throw new Error("todo_recurrence not found");

    const type = payload.type ?? cur.type;
    const interval = payload.interval ?? cur.interval;
    const weekdays =
      payload.weekdays === undefined
        ? cur.weekdays
        : payload.weekdays
          ? JSON.stringify(payload.weekdays)
          : null;
    const monthDay = payload.monthDay === undefined ? cur.month_day : payload.monthDay;
    const yearMonth = payload.yearMonth === undefined ? cur.year_month : payload.yearMonth;
    const yearDay = payload.yearDay === undefined ? cur.year_day : payload.yearDay;
    const excludeHolidays =
      payload.excludeHolidays === undefined
        ? cur.exclude_holidays
        : payload.excludeHolidays
          ? 1
          : 0;
    const startDate = payload.startDate ?? cur.start_date;
    const endDate = payload.endDate === undefined ? cur.end_date : payload.endDate;
    const maxOccurrences =
      payload.maxOccurrences === undefined ? cur.max_occurrences : payload.maxOccurrences;

    db.prepare(
      `UPDATE todo_recurrence SET type = ?, interval = ?, weekdays = ?, month_day = ?, year_month = ?, year_day = ?, exclude_holidays = ?, start_date = ?, end_date = ?, max_occurrences = ?, update_time = ? WHERE id = ?`
    ).run(
      type,
      interval,
      weekdays,
      monthDay,
      yearMonth,
      yearDay,
      excludeHolidays,
      startDate,
      endDate,
      maxOccurrences,
      now,
      payload.id
    );

    if (!options.preserveHistory) {
      const owner = db
        .prepare("SELECT create_time FROM todo_item WHERE id=?")
        .get(cur.todo_item_id) as { create_time: number } | undefined;
      const history = db
        .prepare("SELECT 1 FROM todo_recurrence_history WHERE todo_item_id=? LIMIT 1")
        .get(cur.todo_item_id);
      if (owner && history) {
        const ref = {
          kind: "todo" as const,
          todoId: cur.todo_item_id as number,
          createdAt: owner.create_time,
        };
        const segments = amendSegments(independentSegments(db, ref), localDate(now), {
          type,
          interval,
          weekdays: weekdays ? JSON.parse(weekdays) : undefined,
          monthDay: monthDay ?? undefined,
          yearMonth: yearMonth ?? undefined,
          yearDay: yearDay ?? undefined,
          startDate: localDate(startDate),
          endDate: endDate == null ? null : localDate(endDate),
          excludeHolidays: !!excludeHolidays,
          maxOccurrences,
        });
        const segment = segments.at(-1)!;
        db.prepare(
          `INSERT INTO todo_recurrence_history VALUES (?,?,?,?,?,?) ON CONFLICT(todo_item_id,todo_created_at,effective_date)
          DO UPDATE SET rule_json=excluded.rule_json`
        ).run(
          segment.seriesId,
          ref.todoId,
          ref.createdAt,
          segment.effectiveDate,
          JSON.stringify(segment.rule),
          now
        );
      }
    }

    return this.getRecurrence(db, { id: payload.id })!;
  }

  static deleteRecurrence(db: Database.Database, params: { id: number }): number {
    const row = db.prepare("SELECT todo_item_id FROM todo_recurrence WHERE id=?").get(params.id) as
      { todo_item_id: number } | undefined;
    if (row) this.stopHistory(db, row.todo_item_id);
    const res = db.prepare(`DELETE FROM todo_recurrence WHERE id = ?`).run(params.id);
    return res.changes;
  }

  static deleteRecurrenceByItemId(db: Database.Database, params: { todoItemId: number }): number {
    this.stopHistory(db, params.todoItemId);
    const res = db
      .prepare(`DELETE FROM todo_recurrence WHERE todo_item_id = ?`)
      .run(params.todoItemId);
    return res.changes;
  }

  private static stopHistory(db: Database.Database, todoId: number) {
    const row = db.prepare("SELECT create_time FROM todo_item WHERE id=?").get(todoId) as
      { create_time: number } | undefined;
    if (
      !row ||
      !db.prepare("SELECT 1 FROM todo_recurrence_history WHERE todo_item_id=?").get(todoId)
    )
      return;
    const ref = { kind: "todo" as const, todoId, createdAt: row.create_time };
    const segment = amendSegments(independentSegments(db, ref), localDate(Date.now()), null).at(
      -1
    )!;
    db.prepare(
      `INSERT INTO todo_recurrence_history VALUES (?,?,?,?,NULL,?) ON CONFLICT(todo_item_id,todo_created_at,effective_date)
      DO UPDATE SET rule_json=NULL`
    ).run(segment.seriesId, todoId, ref.createdAt, segment.effectiveDate, Date.now());
  }

  // 计算下一个周期日期
  static getNextOccurrence(
    recurrence: TodoRecurrence,
    fromDate: number,
    holidays?: Set<number>
  ): number | null {
    return nextCalendarOccurrence(recurrence, fromDate, holidays);
  }

  // 获取指定日期范围内的所有周期日期
  static getOccurrencesInRange(
    recurrence: TodoRecurrence,
    startDate: number,
    endDate: number,
    holidays?: Set<number>
  ): number[] {
    if (recurrence.segments?.length)
      return taskOccurrencesInRange(
        recurrence.segments,
        recurrence.occurrenceState ?? {},
        localDate(startDate),
        localDate(endDate),
        holidays
      )
        .filter(entry => !entry.state.skipped)
        .map(entry =>
          new Date(
            entry.scheduledAt.length === 10 ? `${entry.scheduledAt}T00:00:00` : entry.scheduledAt
          ).getTime()
        );
    return calendarOccurrencesInRange(recurrence, startDate, endDate, holidays);
  }
}
