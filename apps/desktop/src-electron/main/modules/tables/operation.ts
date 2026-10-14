import Database from "better-sqlite3";
import { Operation } from "@/types";
import dayjs from "dayjs";
import { setImmediate } from "node:timers/promises";

export default class OperationTable {
  static getListenEvents() {
    return {
      "create-operation": this.createOperation.bind(this),
      "get-operation-daily-counts": this.getOperationDailyCounts.bind(this),
      "analyze-operations": this.analyzeOperations.bind(this),
    };
  }

  static parseOperation(operation: any) {
    return {
      ...operation,
      operationTime: operation.operation_time,
      operationId: operation.operation_id,
      operationContentType: operation.operation_content_type,
      operationAction: operation.operation_action,
    };
  }

  static createOperation(db: Database.Database, operation: Omit<Operation, "id">): Operation {
    const { operation_time, operation_id, operation_content_type, operation_action } = operation;
    const stmt = db.prepare(`
      INSERT INTO operation (operation_time, operation_id, operation_content_type, operation_action)
      VALUES (?, ?, ?, ?)
    `);
    const res = stmt.run(operation_time, operation_id, operation_content_type, operation_action);
    return this.getOperationById(db, Number(res.lastInsertRowid));
  }

  static getOperationById(db: Database.Database, id: number): Operation {
    const stmt = db.prepare("SELECT * FROM operation WHERE id = ?");
    const operation = stmt.get(id);
    return this.parseOperation(operation);
  }

  private static dailyCountsInFlight = new WeakMap<
    Database.Database,
    Map<number, Promise<Array<{ time: string; count: number }>>>
  >();

  /** 主键分页限制单次同步工作量，批次间让出主线程；IPC 只返回每日计数。 */
  static getOperationDailyCounts(
    db: Database.Database,
    year: number
  ): Promise<Array<{ time: string; count: number }>> {
    let pending = this.dailyCountsInFlight.get(db);
    if (!pending) {
      pending = new Map();
      this.dailyCountsInFlight.set(db, pending);
    }
    const existing = pending.get(year);
    if (existing) return existing;
    const task = this.collectOperationDailyCounts(db, year).finally(() => pending.delete(year));
    pending.set(year, task);
    return task;
  }

  private static async collectOperationDailyCounts(
    db: Database.Database,
    year: number
  ): Promise<Array<{ time: string; count: number }>> {
    if (!Number.isInteger(year) || year < 100 || year > 9998) {
      throw new Error("无效的统计年份");
    }
    const start = new Date(year, 0, 1).getTime();
    const end = new Date(year + 1, 0, 1).getTime();
    const upperId = (
      db.prepare("SELECT MAX(id) AS id FROM operation").get() as { id: number | null }
    ).id;
    if (upperId === null) return [];
    // 不在分页 SQL 中过滤年份：没有时间索引时，稀疏年份也必须保持每批扫描有界。
    const stmt = db.prepare(`
      SELECT id, operation_time, operation_id FROM operation
      WHERE id > ? AND id <= ? ORDER BY id LIMIT 1000
    `);
    const days = new Map<string, Set<number>>();
    let afterId = Number.MIN_SAFE_INTEGER;
    while (afterId < upperId) {
      await setImmediate();
      const rows = stmt.all(afterId, upperId) as Array<{
        id: number;
        operation_time: number;
        operation_id: number | null;
      }>;
      if (!rows.length) break;
      for (const row of rows) {
        if (row.operation_time < start || row.operation_time >= end) continue;
        const date = new Date(row.operation_time);
        const time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        let ids = days.get(time);
        if (!ids) {
          ids = new Set();
          days.set(time, ids);
        }
        ids.add(row.operation_id ?? -1);
      }
      afterId = rows[rows.length - 1].id;
    }
    return [...days]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([time, ids]) => ({ time, count: ids.size }));
  }

  static insertOperation(
    db: Database.Database,
    operationContentType: string,
    operationAction: string,
    operationId: number | bigint,
    operationTime: number
  ) {
    const stmt = db.prepare(
      `INSERT INTO operation (operation_content_type, operation_action, operation_id, operation_time) VALUES (?, ?, ?, ?)`
    );
    stmt.run(operationContentType, operationAction, operationId, operationTime);
  }

  // 批量日期查询
  static getOperationsByDates(
    db: Database.Database,
    dates: string[],
    contentType: string
  ): Record<string, Operation[]> {
    if (dates.length === 0) return {};

    const placeholders = dates.map(() => "?").join(",");
    const stmt = db.prepare(`
      SELECT * FROM operation
      WHERE operation_content_type = ?
      AND date(operation_time/1000, 'unixepoch') IN (${placeholders})
      ORDER BY operation_time ASC
    `);

    const operations = stmt.all(contentType, ...dates) as any[];
    const result: Record<string, Operation[]> = {};

    operations.forEach(op => {
      const parsed = this.parseOperation(op);
      const date = dayjs(parsed.operationTime).format("YYYY-MM-DD");
      if (!result[date]) {
        result[date] = [];
      }
      result[date].push(parsed);
    });

    return result;
  }

  // 范围查询
  static getOperationsByDateRange(
    db: Database.Database,
    startDate: string,
    endDate: string,
    contentType: string
  ): Record<string, Operation[]> {
    const startTimestamp = dayjs(startDate).valueOf();
    const endTimestamp = dayjs(endDate).endOf("day").valueOf();

    const stmt = db.prepare(`
      SELECT * FROM operation
      WHERE operation_content_type = ?
      AND operation_time >= ?
      AND operation_time <= ?
      ORDER BY operation_time ASC
    `);

    const operations = stmt.all(contentType, startTimestamp, endTimestamp) as any[];
    const result: Record<string, Operation[]> = {};

    operations.forEach(op => {
      const parsed = this.parseOperation(op);
      const date = dayjs(parsed.operationTime).format("YYYY-MM-DD");
      if (!result[date]) {
        result[date] = [];
      }
      result[date].push(parsed);
    });

    return result;
  }

  // 详细操作分析
  static analyzeOperations(
    db: Database.Database,
    params: {
      dates?: string[];
      startDate?: string;
      endDate?: string;
      contentType: string;
    }
  ): Record<string, any> {
    let operationsByDate: Record<string, Operation[]>;

    if (params.dates && params.dates.length > 0) {
      operationsByDate = this.getOperationsByDates(db, params.dates, params.contentType);
    } else if (params.startDate && params.endDate) {
      operationsByDate = this.getOperationsByDateRange(
        db,
        params.startDate,
        params.endDate,
        params.contentType
      );
    } else {
      return {};
    }

    const result: Record<string, any> = {};

    Object.keys(operationsByDate).forEach(date => {
      const operations = operationsByDate[date];
      const created: number[] = [];
      const deleted: number[] = [];
      const updateOps: Operation[] = [];

      operations.forEach(op => {
        if (op.operation_action === "insert") {
          created.push(op.operation_id);
        } else if (op.operation_action === "delete") {
          deleted.push(op.operation_id);
        } else if (op.operation_action === "update") {
          updateOps.push(op);
        }
      });

      // 合并连续的编辑操作
      const editSessions = this.mergeEditSessions(updateOps);

      result[date] = {
        date,
        created,
        edited: editSessions,
        deleted,
      };
    });

    return result;
  }

  // 辅助方法：合并编辑会话
  private static mergeEditSessions(operations: Operation[]): Array<{
    id: number;
    periods: Array<{
      startTime: string;
      endTime: string;
      durationSeconds: number;
    }>;
  }> {
    if (operations.length === 0) return [];

    // 按 operation_id 分组
    const grouped = new Map<number, Operation[]>();
    operations.forEach(op => {
      if (!grouped.has(op.operation_id)) {
        grouped.set(op.operation_id, []);
      }
      grouped.get(op.operation_id)!.push(op);
    });

    const result: Array<{
      id: number;
      periods: Array<{
        startTime: string;
        endTime: string;
        durationSeconds: number;
      }>;
    }> = [];

    grouped.forEach((ops, id) => {
      // 按时间排序
      ops.sort((a, b) => a.operation_time - b.operation_time);

      const periods: Array<{
        startTime: string;
        endTime: string;
        durationSeconds: number;
      }> = [];
      let currentSession: { start: number; end: number } | null = null;
      const threshold = 3 * 60 * 1000; // 3 分钟

      ops.forEach(op => {
        if (!currentSession) {
          currentSession = { start: op.operation_time, end: op.operation_time };
        } else if (op.operation_time - currentSession.end < threshold) {
          // 扩展当前会话
          currentSession.end = op.operation_time;
        } else {
          // 保存当前会话，开始新会话
          periods.push({
            startTime: dayjs(currentSession.start).format("YYYY-MM-DD HH:mm:ss"),
            endTime: dayjs(currentSession.end).format("YYYY-MM-DD HH:mm:ss"),
            durationSeconds: Math.floor((currentSession.end - currentSession.start) / 1000),
          });
          currentSession = { start: op.operation_time, end: op.operation_time };
        }
      });

      // 添加最后一个会话
      if (currentSession) {
        const session = currentSession as { start: number; end: number };
        periods.push({
          startTime: dayjs(session.start).format("YYYY-MM-DD HH:mm:ss"),
          endTime: dayjs(session.end).format("YYYY-MM-DD HH:mm:ss"),
          durationSeconds: Math.floor((session.end - session.start) / 1000),
        });
      }

      if (periods.length > 0) {
        result.push({ id, periods });
      }
    });

    return result;
  }
}
