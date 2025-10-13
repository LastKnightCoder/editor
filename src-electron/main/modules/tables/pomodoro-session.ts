import Database from "better-sqlite3";
import { Notification } from "electron";

export type PomodoroStatus =
  | "running"
  | "paused"
  | "completed"
  | "stopped"
  | "aborted";

export interface PauseSpan {
  start: number;
  end?: number;
}

export interface PomodoroSessionRow {
  id: number;
  preset_id: number;
  start_time: number;
  end_time: number | null;
  expected_ms: number | null;
  focus_ms: number;
  pause_total_ms: number;
  pause_count: number;
  pauses: string; // JSON
  status: PomodoroStatus;
  create_time: number;
  update_time: number;
}

export interface PomodoroSession {
  id: number;
  presetId: number;
  startTime: number;
  endTime?: number;
  expectedMs?: number;
  focusMs: number;
  pauseTotalMs: number;
  pauseCount: number;
  pauses: PauseSpan[];
  status: PomodoroStatus;
  createTime: number;
  updateTime: number;
}

const parse = (row: PomodoroSessionRow): PomodoroSession => ({
  id: row.id,
  presetId: row.preset_id,
  startTime: row.start_time,
  endTime: row.end_time ?? undefined,
  expectedMs: row.expected_ms ?? undefined,
  focusMs: row.focus_ms,
  pauseTotalMs: row.pause_total_ms,
  pauseCount: row.pause_count,
  pauses: JSON.parse(row.pauses || "[]"),
  status: row.status,
  createTime: row.create_time,
  updateTime: row.update_time,
});

class PomodoroSessionTable {
  static initTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pomodoro_sessions (
        id INTEGER PRIMARY KEY,
        preset_id INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        expected_ms INTEGER,
        focus_ms INTEGER NOT NULL DEFAULT 0,
        pause_total_ms INTEGER NOT NULL DEFAULT 0,
        pause_count INTEGER NOT NULL DEFAULT 0,
        pauses TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
    `);

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_session_status ON pomodoro_sessions(status);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_session_start ON pomodoro_sessions(start_time);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_session_preset ON pomodoro_sessions(preset_id);`,
    );
  }

  static upgradeTable(_db: Database.Database): void {
    // 暂无迁移
    void _db;
  }

  static getListenEvents() {
    return {
      "pomodoro:list-sessions": this.listSessions.bind(this),
      "pomodoro:summary-today": this.summaryToday.bind(this),
      "pomodoro:summary-total": this.summaryTotal.bind(this),
    } as const;
  }

  static insertCompletedSession(
    db: Database.Database,
    session: {
      presetId: number;
      startTime: number;
      endTime: number;
      expectedMs?: number;
      focusMs: number;
      pauseTotalMs: number;
      pauseCount: number;
      pauses: PauseSpan[];
      status: "completed" | "stopped";
    },
  ): PomodoroSession {
    const now = Date.now();

    // 直接插入完成的 session
    db.prepare(
      `INSERT INTO pomodoro_sessions (preset_id, start_time, end_time, expected_ms, focus_ms, pause_total_ms, pause_count, pauses, status, create_time, update_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session.presetId,
      session.startTime,
      session.endTime,
      session.expectedMs ?? null,
      session.focusMs,
      session.pauseTotalMs,
      session.pauseCount,
      JSON.stringify(session.pauses),
      session.status,
      now,
      now,
    );

    const inserted = db.prepare(`SELECT last_insert_rowid() as id`).get() as {
      id: number | bigint;
    };
    const id = Number(inserted.id);

    // 发送系统通知
    try {
      const title = session.status === "completed" ? "番茄完成" : "专注结束";
      const body = `专注 ${Math.round(session.focusMs / 60000)} 分钟`;
      new Notification({ title, body }).show();
    } catch (_e) {
      // ignore
    }

    const res = this.getById(db, id);
    if (!res) throw new Error("failed to fetch inserted pomodoro session");
    return res;
  }

  static getById(db: Database.Database, id: number): PomodoroSession | null {
    const row = db
      .prepare(`SELECT * FROM pomodoro_sessions WHERE id = ?`)
      .get(id) as PomodoroSessionRow | undefined;
    return row ? parse(row) : null;
  }

  static listSessions(
    db: Database.Database,
    params: {
      presetId?: number;
      start?: number;
      end?: number;
      limit?: number;
      status?: PomodoroStatus;
    },
  ): PomodoroSession[] {
    const clauses: string[] = [];
    const values: (number | string)[] = [];
    if (params.presetId !== undefined) {
      clauses.push("preset_id = ?");
      values.push(params.presetId);
    }
    if (params.status) {
      clauses.push("status = ?");
      values.push(params.status);
    }
    if (params.start) {
      clauses.push("start_time >= ?");
      values.push(params.start);
    }
    if (params.end) {
      clauses.push("start_time < ?");
      values.push(params.end);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = params.limit ? `LIMIT ${params.limit}` : "";
    const rows = db
      .prepare(
        `SELECT * FROM pomodoro_sessions ${where} ORDER BY start_time DESC ${limit}`,
      )
      .all(...values) as PomodoroSessionRow[];
    return rows.map(parse);
  }

  static summaryToday(db: Database.Database): {
    count: number;
    focusMs: number;
  } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const rows = db
      .prepare(
        `SELECT focus_ms FROM pomodoro_sessions WHERE end_time IS NOT NULL AND end_time >= ? AND end_time <= ?`,
      )
      .all(start.getTime(), end.getTime()) as Array<{ focus_ms: number }>;
    return {
      count: rows.length,
      focusMs: rows.reduce((a, b) => a + (b.focus_ms || 0), 0),
    };
  }

  static summaryTotal(db: Database.Database): {
    count: number;
    focusMs: number;
  } {
    const row = db
      .prepare(
        `SELECT COUNT(*) as c, COALESCE(SUM(focus_ms),0) as s FROM pomodoro_sessions WHERE end_time IS NOT NULL`,
      )
      .get() as { c: number; s: number };
    return { count: row.c || 0, focusMs: row.s || 0 };
  }
}

export default PomodoroSessionTable;
