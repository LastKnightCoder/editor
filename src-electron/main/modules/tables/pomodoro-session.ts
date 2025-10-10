import Database from "better-sqlite3";
import { BrowserWindow, Notification } from "electron";

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
        update_time INTEGER NOT NULL,
        FOREIGN KEY(preset_id) REFERENCES pomodoro_presets(id)
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
      "pomodoro:start-session": this.startSession.bind(this),
      "pomodoro:pause-session": this.pauseSession.bind(this),
      "pomodoro:resume-session": this.resumeSession.bind(this),
      "pomodoro:stop-session": this.stopSession.bind(this),
      "pomodoro:get-active-session": this.getActiveSession.bind(this),
      "pomodoro:list-sessions": this.listSessions.bind(this),
      "pomodoro:summary-today": this.summaryToday.bind(this),
      "pomodoro:summary-total": this.summaryTotal.bind(this),
      "pomodoro:subscribe-tick": this.subscribeTick.bind(this),
    } as const;
  }

  private static getActiveRow(
    db: Database.Database,
  ): PomodoroSessionRow | undefined {
    return db
      .prepare(
        `SELECT * FROM pomodoro_sessions WHERE status IN ('running','paused') ORDER BY start_time DESC LIMIT 1`,
      )
      .get() as PomodoroSessionRow | undefined;
  }

  static getActiveSession(db: Database.Database): PomodoroSession | null {
    const row = this.getActiveRow(db);
    return row ? parse(row) : null;
  }

  static startSession(
    db: Database.Database,
    payload: { presetId: number; expectedMs?: number },
    win: BrowserWindow,
  ): PomodoroSession {
    // 若已有活动会话，先终止为 aborted
    const active = this.getActiveRow(db);
    if (active) {
      const now = Date.now();
      const pauses: PauseSpan[] = JSON.parse(active.pauses || "[]");
      // 若存在未闭合暂停，闭合它
      const last = pauses[pauses.length - 1];
      if (last && last.end === undefined) {
        last.end = now;
      }
      const totalPause = pauses.reduce(
        (acc, p) => acc + ((p.end ?? now) - p.start),
        0,
      );
      const focusMs = Math.max(0, now - active.start_time - totalPause);
      db.prepare(
        `UPDATE pomodoro_sessions SET end_time = ?, pause_total_ms = ?, pause_count = ?, pauses = ?, focus_ms = ?, status = 'aborted', update_time = ? WHERE id = ?`,
      ).run(
        now,
        totalPause,
        pauses.length,
        JSON.stringify(pauses),
        focusMs,
        now,
        active.id,
      );
    }

    const now = Date.now();
    db.prepare(
      `INSERT INTO pomodoro_sessions (preset_id, start_time, end_time, expected_ms, focus_ms, pause_total_ms, pause_count, pauses, status, create_time, update_time)
       VALUES (?, ?, NULL, ?, 0, 0, 0, '[]', 'running', ?, ?)`,
    ).run(payload.presetId, now, payload.expectedMs ?? null, now, now);
    const inserted = db.prepare(`SELECT last_insert_rowid() as id`).get() as {
      id: number | bigint;
    };
    const id = Number(inserted.id);

    // 通知界面
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== win && !w.isDestroyed()) {
        w.webContents.send("pomodoro:state-changed");
      }
    });

    const res = this.getById(db, id);
    if (!res) throw new Error("failed to fetch created pomodoro session");
    return res;
  }

  static pauseSession(
    db: Database.Database,
    _payload: void,
    win: BrowserWindow,
  ): PomodoroSession | null {
    const row = this.getActiveRow(db);
    if (!row || row.status !== "running") return row ? parse(row) : null;
    const now = Date.now();
    const pauses: PauseSpan[] = JSON.parse(row.pauses || "[]");
    pauses.push({ start: now });
    db.prepare(
      `UPDATE pomodoro_sessions SET status = 'paused', pauses = ?, pause_count = pause_count + 1, update_time = ? WHERE id = ?`,
    ).run(JSON.stringify(pauses), now, row.id);

    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== win && !w.isDestroyed()) {
        w.webContents.send("pomodoro:state-changed");
      }
    });

    return this.getById(db, row.id);
  }

  static resumeSession(
    db: Database.Database,
    _payload: void,
    win: BrowserWindow,
  ): PomodoroSession | null {
    const row = this.getActiveRow(db);
    if (!row || row.status !== "paused") return row ? parse(row) : null;
    const now = Date.now();
    const pauses: PauseSpan[] = JSON.parse(row.pauses || "[]");
    if (pauses.length === 0 || pauses[pauses.length - 1].end !== undefined) {
      // 无未闭合暂停，直接切回运行
      db.prepare(
        `UPDATE pomodoro_sessions SET status = 'running', update_time = ? WHERE id = ?`,
      ).run(now, row.id);
    } else {
      const last = pauses[pauses.length - 1];
      last.end = now;
      const totalPause = pauses.reduce(
        (acc, p) => acc + ((p.end ?? now) - p.start),
        0,
      );
      db.prepare(
        `UPDATE pomodoro_sessions SET status = 'running', pauses = ?, pause_total_ms = ?, update_time = ? WHERE id = ?`,
      ).run(JSON.stringify(pauses), totalPause, now, row.id);
    }

    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== win && !w.isDestroyed()) {
        w.webContents.send("pomodoro:state-changed");
      }
    });

    return this.getById(db, row.id);
  }

  static stopSession(
    db: Database.Database,
    payload: { asComplete?: boolean } | void,
    win: BrowserWindow,
  ): PomodoroSession | null {
    const row = this.getActiveRow(db);
    if (!row) return null;
    const now = Date.now();
    const pauses: PauseSpan[] = JSON.parse(row.pauses || "[]");
    const last = pauses[pauses.length - 1];
    if (row.status === "paused" && last && last.end === undefined) {
      last.end = now;
    }
    const totalPause = pauses.reduce(
      (acc, p) => acc + ((p.end ?? now) - p.start),
      0,
    );
    const focusMs = Math.max(0, now - row.start_time - totalPause);
    const status: PomodoroStatus =
      payload && payload.asComplete === false ? "stopped" : "completed";
    db.prepare(
      `UPDATE pomodoro_sessions SET status = ?, end_time = ?, pauses = ?, pause_total_ms = ?, focus_ms = ?, update_time = ? WHERE id = ?`,
    ).run(
      status,
      now,
      JSON.stringify(pauses),
      totalPause,
      focusMs,
      now,
      row.id,
    );

    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== win && !w.isDestroyed()) {
        w.webContents.send("pomodoro:state-changed");
      }
    });

    // 结束提醒（系统通知）
    try {
      const title = status === "completed" ? "番茄完成" : "专注结束";
      const body = `专注 ${Math.round(focusMs / 60000)} 分钟`;
      new Notification({ title, body }).show();
    } catch (_e) {
      // ignore
    }

    return this.getById(db, row.id);
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

  // 简单 tick 推送（供小窗或页面按需订阅）
  private static _timer: NodeJS.Timer | null = null;
  static subscribeTick(_db: Database.Database) {
    if (!this._timer) {
      this._timer = setInterval(() => {
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) w.webContents.send("pomodoro:tick");
        });
      }, 1000);
    }
    return true;
  }
}

export default PomodoroSessionTable;
