import Database from "better-sqlite3";
import {
  TodoRecurrence,
  CreateTodoRecurrence,
  UpdateTodoRecurrence,
  RecurrenceType,
} from "@/types";

export default class TodoRecurrenceTable {
  static initTable(db: Database.Database) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS todo_recurrence (
        id INTEGER PRIMARY KEY,
        todo_item_id INTEGER NOT NULL UNIQUE,
        type TEXT NOT NULL,
        interval INTEGER NOT NULL DEFAULT 1,
        weekdays TEXT,
        month_day INTEGER,
        year_month INTEGER,
        year_day INTEGER,
        exclude_holidays INTEGER NOT NULL DEFAULT 0,
        start_date INTEGER NOT NULL,
        end_date INTEGER,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );`,
    );

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_recurrence_todo_item ON todo_recurrence(todo_item_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_recurrence_type ON todo_recurrence(type);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_recurrence_start_date ON todo_recurrence(start_date);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_todo_recurrence_end_date ON todo_recurrence(end_date);`,
    );
  }

  static upgradeTable(db: Database.Database) {
    // 检查是否存在 max_occurrences 列
    const tableInfo = db.pragma("table_info(todo_recurrence)") as Array<{
      name: string;
    }>;
    const hasMaxOccurrences = tableInfo.some(
      (col) => col.name === "max_occurrences",
    );

    if (!hasMaxOccurrences) {
      db.exec(
        `ALTER TABLE todo_recurrence ADD COLUMN max_occurrences INTEGER;`,
      );
    }
  }

  static getListenEvents() {
    return {
      "todo:get-recurrence": this.getRecurrence.bind(this),
      "todo:get-recurrence-by-item": this.getRecurrenceByItemId.bind(this),
      "todo:create-recurrence": this.createRecurrence.bind(this),
      "todo:update-recurrence": this.updateRecurrence.bind(this),
      "todo:delete-recurrence": this.deleteRecurrence.bind(this),
      "todo:delete-recurrence-by-item":
        this.deleteRecurrenceByItemId.bind(this),
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

  static getRecurrence(
    db: Database.Database,
    params: { id: number },
  ): TodoRecurrence | null {
    const row = db
      .prepare(`SELECT * FROM todo_recurrence WHERE id = ?`)
      .get(params.id);
    return row ? this.parse(row) : null;
  }

  static getRecurrenceByItemId(
    db: Database.Database,
    params: { todoItemId: number },
  ): TodoRecurrence | null {
    const row = db
      .prepare(`SELECT * FROM todo_recurrence WHERE todo_item_id = ?`)
      .get(params.todoItemId);
    return row ? this.parse(row) : null;
  }

  static createRecurrence(
    db: Database.Database,
    payload: CreateTodoRecurrence,
  ): TodoRecurrence {
    const now = Date.now();
    const stmt = db.prepare(
      `INSERT INTO todo_recurrence (todo_item_id, type, interval, weekdays, month_day, year_month, year_day, exclude_holidays, start_date, end_date, max_occurrences, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      now,
    );

    const id = Number(res.lastInsertRowid);
    return this.getRecurrence(db, { id })!;
  }

  static updateRecurrence(
    db: Database.Database,
    payload: UpdateTodoRecurrence,
  ): TodoRecurrence {
    const now = Date.now();
    const cur = db
      .prepare(`SELECT * FROM todo_recurrence WHERE id = ?`)
      .get(payload.id) as any;

    if (!cur) throw new Error("todo_recurrence not found");

    const type = payload.type ?? cur.type;
    const interval = payload.interval ?? cur.interval;
    const weekdays =
      payload.weekdays === undefined
        ? cur.weekdays
        : payload.weekdays
          ? JSON.stringify(payload.weekdays)
          : null;
    const monthDay =
      payload.monthDay === undefined ? cur.month_day : payload.monthDay;
    const yearMonth =
      payload.yearMonth === undefined ? cur.year_month : payload.yearMonth;
    const yearDay =
      payload.yearDay === undefined ? cur.year_day : payload.yearDay;
    const excludeHolidays =
      payload.excludeHolidays === undefined
        ? cur.exclude_holidays
        : payload.excludeHolidays
          ? 1
          : 0;
    const startDate = payload.startDate ?? cur.start_date;
    const endDate =
      payload.endDate === undefined ? cur.end_date : payload.endDate;
    const maxOccurrences =
      payload.maxOccurrences === undefined
        ? cur.max_occurrences
        : payload.maxOccurrences;

    db.prepare(
      `UPDATE todo_recurrence SET type = ?, interval = ?, weekdays = ?, month_day = ?, year_month = ?, year_day = ?, exclude_holidays = ?, start_date = ?, end_date = ?, max_occurrences = ?, update_time = ? WHERE id = ?`,
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
      payload.id,
    );

    return this.getRecurrence(db, { id: payload.id })!;
  }

  static deleteRecurrence(
    db: Database.Database,
    params: { id: number },
  ): number {
    const res = db
      .prepare(`DELETE FROM todo_recurrence WHERE id = ?`)
      .run(params.id);
    return res.changes;
  }

  static deleteRecurrenceByItemId(
    db: Database.Database,
    params: { todoItemId: number },
  ): number {
    const res = db
      .prepare(`DELETE FROM todo_recurrence WHERE todo_item_id = ?`)
      .run(params.todoItemId);
    return res.changes;
  }

  // 计算下一个周期日期
  static getNextOccurrence(
    recurrence: TodoRecurrence,
    fromDate: number,
    holidays?: Set<number>,
  ): number | null {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);

    // 如果已经超过结束日期，返回 null
    if (recurrence.endDate && fromDate > recurrence.endDate) {
      return null;
    }

    let nextDate: Date | null = null;

    switch (recurrence.type) {
      case "daily":
        nextDate = new Date(from);
        nextDate.setDate(nextDate.getDate() + recurrence.interval);
        break;

      case "weekdays":
        nextDate = new Date(from);
        do {
          nextDate.setDate(nextDate.getDate() + 1);
        } while (nextDate.getDay() === 0 || nextDate.getDay() === 6);
        break;

      case "weekly":
        if (recurrence.weekdays && recurrence.weekdays.length > 0) {
          const sortedWeekdays = [...recurrence.weekdays].sort((a, b) => a - b);
          const currentDay = from.getDay();
          let foundNext = false;

          // 查找本周剩余的日期
          for (const wd of sortedWeekdays) {
            if (wd > currentDay) {
              nextDate = new Date(from);
              nextDate.setDate(nextDate.getDate() + (wd - currentDay));
              foundNext = true;
              break;
            }
          }

          // 如果本周没有，跳到下周的第一个指定日期
          if (!foundNext) {
            nextDate = new Date(from);
            const daysUntilNextWeek = 7 - currentDay + sortedWeekdays[0];
            nextDate.setDate(
              nextDate.getDate() +
                daysUntilNextWeek +
                (recurrence.interval - 1) * 7,
            );
          }
        } else {
          // 如果没有指定周几，默认每周同一天
          nextDate = new Date(from);
          nextDate.setDate(nextDate.getDate() + 7 * recurrence.interval);
        }
        break;

      case "monthly":
        nextDate = new Date(from);
        nextDate.setMonth(nextDate.getMonth() + recurrence.interval);
        if (recurrence.monthDay) {
          // 处理月末日期
          const lastDay = new Date(
            nextDate.getFullYear(),
            nextDate.getMonth() + 1,
            0,
          ).getDate();
          nextDate.setDate(Math.min(recurrence.monthDay, lastDay));
        }
        break;

      case "yearly":
        nextDate = new Date(from);
        nextDate.setFullYear(nextDate.getFullYear() + recurrence.interval);
        if (
          recurrence.yearMonth !== null &&
          recurrence.yearMonth !== undefined
        ) {
          nextDate.setMonth(recurrence.yearMonth - 1);
        }
        if (recurrence.yearDay !== null && recurrence.yearDay !== undefined) {
          nextDate.setDate(recurrence.yearDay);
        }
        break;

      case "custom":
        nextDate = new Date(from);
        nextDate.setDate(nextDate.getDate() + recurrence.interval);
        break;
    }

    if (!nextDate) return null;

    // 排除节假日
    if (recurrence.excludeHolidays && holidays) {
      const maxIterations = 365; // 防止无限循环
      let iterations = 0;
      while (
        iterations < maxIterations &&
        (holidays.has(nextDate.getTime()) ||
          nextDate.getDay() === 0 ||
          nextDate.getDay() === 6)
      ) {
        nextDate.setDate(nextDate.getDate() + 1);
        iterations++;
      }
    }

    // 检查是否超过结束日期
    if (recurrence.endDate && nextDate.getTime() > recurrence.endDate) {
      return null;
    }

    return nextDate.getTime();
  }

  // 获取指定日期范围内的所有周期日期
  static getOccurrencesInRange(
    recurrence: TodoRecurrence,
    startDate: number,
    endDate: number,
    holidays?: Set<number>,
  ): number[] {
    const occurrences: number[] = [];

    // 找到第一个有效日期
    const firstDate = new Date(recurrence.startDate);
    firstDate.setHours(0, 0, 0, 0);

    if (firstDate.getTime() >= startDate && firstDate.getTime() <= endDate) {
      occurrences.push(firstDate.getTime());
    }

    // 迭代计算后续日期
    let current = firstDate.getTime();
    const maxIterations = 1000; // 防止无限循环
    let iterations = 0;

    while (iterations < maxIterations) {
      const next = this.getNextOccurrence(recurrence, current, holidays);
      if (next === null || next > endDate) break;

      if (next >= startDate) {
        occurrences.push(next);
      }
      current = next;
      iterations++;
    }

    return occurrences;
  }
}
