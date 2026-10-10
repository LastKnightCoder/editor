import Database from "better-sqlite3";
import TodoRecurrenceTable from "./todo-recurrence";
import { TodoRecurrenceCompletion } from "@/types";

export default class TodoRecurrenceCompletionTable {
  private static originalDate(
    db: Database.Database,
    params: { recurrenceId: number; scheduledDate: number; originalOccurrence?: boolean }
  ) {
    if (params.originalOccurrence) return params;
    const day = new Date(params.scheduledDate);
    day.setHours(0, 0, 0, 0);
    const rows = db
      .prepare(
        `SELECT occurrence_date,state_json FROM todo_occurrence_override
      WHERE todo_item_id IN (SELECT todo_item_id FROM todo_recurrence WHERE id=?)`
      )
      .all(params.recurrenceId) as Array<{ occurrence_date: string; state_json: string }>;
    const matches = rows.filter(row => {
      const state = JSON.parse(row.state_json) as { scheduledAt?: string };
      if (!state.scheduledAt) return false;
      const date = new Date(
        state.scheduledAt.length === 10 ? `${state.scheduledAt}T00:00:00` : state.scheduledAt
      );
      date.setHours(0, 0, 0, 0);
      return date.getTime() === day.getTime();
    });
    const rule = matches.length
      ? TodoRecurrenceTable.getRecurrence(db, { id: params.recurrenceId })
      : null;
    if (
      matches.length > 1 ||
      (rule &&
        TodoRecurrenceTable.getOccurrencesInRange(rule, day.getTime(), day.getTime()).length > 1)
    )
      throw new Error("OCCURRENCE_AMBIGUOUS: 当天有多个改期实例，请在助理中指定原始实例");
    return matches.length
      ? { ...params, scheduledDate: new Date(`${matches[0].occurrence_date}T00:00:00`).getTime() }
      : params;
  }
  private static syncOverride(
    db: Database.Database,
    params: { recurrenceId: number; scheduledDate: number },
    completedAt: number | null,
    skipped: boolean
  ) {
    const day = new Date(params.scheduledDate);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    db.prepare(
      `UPDATE todo_occurrence_override SET state_json=json_set(state_json,'$.completedAt',?,'$.skipped',json(?)),update_time=?
      WHERE todo_item_id IN (SELECT todo_item_id FROM todo_recurrence WHERE id=?) AND occurrence_date=?`
    ).run(completedAt, JSON.stringify(skipped), Date.now(), params.recurrenceId, date);
  }
  static getListenEvents() {
    return {
      "todo:get-recurrence-completions": this.getCompletions.bind(this),
      "todo:get-recurrence-completions-by-recurrence-ids":
        this.getCompletionsByRecurrenceIds.bind(this),
      "todo:get-recurrence-completion": this.getCompletion.bind(this),
      "todo:complete-recurrence": this.completeRecurrence.bind(this),
      "todo:uncomplete-recurrence": this.uncompleteRecurrence.bind(this),
      "todo:skip-recurrence": this.skipRecurrence.bind(this),
      "todo:delete-recurrence-completions": this.deleteByRecurrenceId.bind(this),
    } as const;
  }

  static parse(row: any): TodoRecurrenceCompletion {
    return {
      id: row.id,
      recurrenceId: row.recurrence_id,
      scheduledDate: row.scheduled_date,
      completedAt: row.completed_at ?? null,
      skipped: Boolean(row.skipped),
      createTime: row.create_time,
    };
  }

  // 获取周期任务的所有完成记录
  static getCompletions(
    db: Database.Database,
    params: { recurrenceId: number; startDate?: number; endDate?: number }
  ): TodoRecurrenceCompletion[] {
    let sql = `SELECT * FROM todo_recurrence_completion WHERE recurrence_id = ?`;
    const args: any[] = [params.recurrenceId];

    if (params.startDate !== undefined) {
      sql += ` AND scheduled_date >= ?`;
      args.push(params.startDate);
    }

    if (params.endDate !== undefined) {
      sql += ` AND scheduled_date <= ?`;
      args.push(params.endDate);
    }

    sql += ` ORDER BY scheduled_date ASC`;

    const rows = db.prepare(sql).all(...args) as any[];
    return rows.map(this.parse);
  }

  static getCompletionsByRecurrenceIds(
    db: Database.Database,
    params: { recurrenceIds: number[]; startDate?: number; endDate?: number }
  ): Record<number, TodoRecurrenceCompletion[]> {
    if (!params.recurrenceIds.length) {
      return {};
    }

    const placeholders = params.recurrenceIds.map(() => "?").join(",");
    let sql = `SELECT * FROM todo_recurrence_completion WHERE recurrence_id IN (${placeholders})`;
    const args: Array<number> = [...params.recurrenceIds];

    if (params.startDate !== undefined) {
      sql += ` AND scheduled_date >= ?`;
      args.push(params.startDate);
    }

    if (params.endDate !== undefined) {
      sql += ` AND scheduled_date <= ?`;
      args.push(params.endDate);
    }

    sql += ` ORDER BY recurrence_id ASC, scheduled_date ASC`;

    const rows = db.prepare(sql).all(...args) as any[];
    const grouped: Record<number, TodoRecurrenceCompletion[]> = {};
    rows.forEach(row => {
      const completion = this.parse(row);
      grouped[completion.recurrenceId] = [...(grouped[completion.recurrenceId] ?? []), completion];
    });
    return grouped;
  }

  // 获取特定日期的完成记录
  static getCompletion(
    db: Database.Database,
    params: { recurrenceId: number; scheduledDate: number }
  ): TodoRecurrenceCompletion | null {
    const row = db
      .prepare(
        `SELECT * FROM todo_recurrence_completion WHERE recurrence_id = ? AND scheduled_date = ?`
      )
      .get(params.recurrenceId, params.scheduledDate);
    return row ? this.parse(row) : null;
  }

  // 标记周期任务为已完成
  static completeRecurrence(
    db: Database.Database,
    params: { recurrenceId: number; scheduledDate: number; originalOccurrence?: boolean }
  ): TodoRecurrenceCompletion {
    params = this.originalDate(db, params);
    const now = Date.now();
    this.syncOverride(db, params, now, false);

    // 使用 upsert 逻辑
    const existing = this.getCompletion(db, params);

    if (existing) {
      db.prepare(
        `UPDATE todo_recurrence_completion SET completed_at = ?, skipped = 0 WHERE id = ?`
      ).run(now, existing.id);
      return this.getCompletion(db, params)!;
    }

    db.prepare(
      `INSERT INTO todo_recurrence_completion (recurrence_id, scheduled_date, completed_at, skipped, create_time)
       VALUES (?, ?, ?, 0, ?)`
    ).run(params.recurrenceId, params.scheduledDate, now, now);

    return this.getCompletion(db, params)!;
  }

  // 取消周期任务的完成状态
  static uncompleteRecurrence(
    db: Database.Database,
    params: { recurrenceId: number; scheduledDate: number; originalOccurrence?: boolean }
  ): number {
    params = this.originalDate(db, params);
    this.syncOverride(db, params, null, false);
    const res = db
      .prepare(
        `DELETE FROM todo_recurrence_completion WHERE recurrence_id = ? AND scheduled_date = ?`
      )
      .run(params.recurrenceId, params.scheduledDate);
    return res.changes;
  }

  // 跳过周期任务
  static skipRecurrence(
    db: Database.Database,
    params: { recurrenceId: number; scheduledDate: number; originalOccurrence?: boolean }
  ): TodoRecurrenceCompletion {
    params = this.originalDate(db, params);
    const now = Date.now();
    this.syncOverride(db, params, null, true);

    // 使用 upsert 逻辑
    const existing = this.getCompletion(db, params);

    if (existing) {
      db.prepare(
        `UPDATE todo_recurrence_completion SET skipped = 1, completed_at = NULL WHERE id = ?`
      ).run(existing.id);
      return this.getCompletion(db, params)!;
    }

    db.prepare(
      `INSERT INTO todo_recurrence_completion (recurrence_id, scheduled_date, completed_at, skipped, create_time)
       VALUES (?, ?, NULL, 1, ?)`
    ).run(params.recurrenceId, params.scheduledDate, now);

    return this.getCompletion(db, params)!;
  }

  // 删除周期任务的所有完成记录
  static deleteByRecurrenceId(db: Database.Database, params: { recurrenceId: number }): number {
    const res = db
      .prepare(`DELETE FROM todo_recurrence_completion WHERE recurrence_id = ?`)
      .run(params.recurrenceId);
    return res.changes;
  }

  // 获取周期任务在指定日期范围内的完成统计
  static getCompletionStats(
    db: Database.Database,
    params: { recurrenceId: number; startDate: number; endDate: number }
  ): { total: number; completed: number; skipped: number } {
    const row = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) as skipped
         FROM todo_recurrence_completion
         WHERE recurrence_id = ? AND scheduled_date >= ? AND scheduled_date <= ?`
      )
      .get(params.recurrenceId, params.startDate, params.endDate) as any;

    return {
      total: row?.total || 0,
      completed: row?.completed || 0,
      skipped: row?.skipped || 0,
    };
  }

  // 检查指定日期是否已完成
  static isCompleted(
    db: Database.Database,
    params: { recurrenceId: number; scheduledDate: number }
  ): boolean {
    const row = db
      .prepare(
        `SELECT completed_at FROM todo_recurrence_completion WHERE recurrence_id = ? AND scheduled_date = ?`
      )
      .get(params.recurrenceId, params.scheduledDate) as
      { completed_at: number | null } | undefined;
    return row?.completed_at !== null && row?.completed_at !== undefined;
  }

  // 检查指定日期是否已跳过
  static isSkipped(
    db: Database.Database,
    params: { recurrenceId: number; scheduledDate: number }
  ): boolean {
    const row = db
      .prepare(
        `SELECT skipped FROM todo_recurrence_completion WHERE recurrence_id = ? AND scheduled_date = ?`
      )
      .get(params.recurrenceId, params.scheduledDate) as { skipped: number } | undefined;
    return Boolean(row?.skipped);
  }
}
