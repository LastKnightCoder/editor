import Database from "better-sqlite3";

export type PomodoroMode = "countdown" | "countup";

export interface PomodoroPresetRow {
  id: number;
  name: string;
  mode: PomodoroMode; // countdown | countup
  duration_min: number; // only for countdown
  sort_order: number;
  archived: number; // 0/1
  create_time: number;
  update_time: number;
}

export interface PomodoroPreset {
  id: number;
  name: string;
  mode: PomodoroMode;
  durationMin: number;
  sortOrder: number;
  archived: boolean;
  createTime: number;
  updateTime: number;
}

const parse = (row: PomodoroPresetRow): PomodoroPreset => ({
  id: row.id,
  name: row.name,
  mode: row.mode,
  durationMin: row.duration_min,
  sortOrder: row.sort_order,
  archived: !!row.archived,
  createTime: row.create_time,
  updateTime: row.update_time,
});

class PomodoroPresetTable {
  static initTable(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pomodoro_presets (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        duration_min INTEGER NOT NULL DEFAULT 25,
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
    `);

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_preset_archived ON pomodoro_presets(archived);`,
    );

    // 如果表为空，插入一个默认预设
    const countRow = db
      .prepare(`SELECT COUNT(*) as c FROM pomodoro_presets`)
      .get() as { c: number };
    if (!countRow || countRow.c === 0) {
      const now = Date.now();
      db.prepare(
        `INSERT INTO pomodoro_presets (name, mode, duration_min, sort_order, archived, create_time, update_time)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      ).run("默认 25m", "countdown", 25, 0, now, now);
    }
  }

  static upgradeTable(_db: Database.Database): void {
    // 目前无迁移
    // 标记参数已使用，避免未使用告警
    void _db;
  }

  static getListenEvents() {
    return {
      "pomodoro:list-presets": this.list.bind(this),
      "pomodoro:create-preset": this.create.bind(this),
      "pomodoro:update-preset": this.update.bind(this),
      "pomodoro:archive-preset": this.archive.bind(this),
      "pomodoro:reorder-presets": this.reorder.bind(this),
      "pomodoro:delete-preset": this.remove.bind(this),
      "pomodoro:get-preset": this.getById.bind(this),
    } as const;
  }

  static list(db: Database.Database): PomodoroPreset[] {
    const rows = db
      .prepare(
        `SELECT * FROM pomodoro_presets ORDER BY archived ASC, sort_order ASC, create_time ASC`,
      )
      .all() as PomodoroPresetRow[];
    return rows.map(parse);
  }

  static getById(db: Database.Database, id: number): PomodoroPreset | null {
    const row = db
      .prepare(`SELECT * FROM pomodoro_presets WHERE id = ?`)
      .get(id) as PomodoroPresetRow | undefined;
    return row ? parse(row) : null;
  }

  static getMaxSortIndex(db: Database.Database): number {
    const row = db
      .prepare(`SELECT MAX(sort_order) as max_idx FROM pomodoro_presets`)
      .get() as { max_idx: number | null };
    return row?.max_idx ?? 0;
  }

  static create(
    db: Database.Database,
    payload: { name: string; mode: PomodoroMode; durationMin?: number },
  ): PomodoroPreset {
    const now = Date.now();
    const sort = this.getMaxSortIndex(db) + 1024;
    db.prepare(
      `INSERT INTO pomodoro_presets (name, mode, duration_min, sort_order, archived, create_time, update_time)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).run(
      payload.name,
      payload.mode,
      payload.durationMin ?? 25,
      sort,
      now,
      now,
    );
    const inserted = db.prepare(`SELECT last_insert_rowid() as id`).get() as {
      id: number | bigint;
    };
    const id = Number(inserted.id);
    const res = this.getById(db, id);
    if (!res) throw new Error("failed to fetch created pomodoro preset");
    return res;
  }

  static update(
    db: Database.Database,
    payload: {
      id: number;
      name?: string;
      mode?: PomodoroMode;
      durationMin?: number;
    },
  ): PomodoroPreset {
    const cur = this.getById(db, payload.id);
    if (!cur) throw new Error("preset not found");
    const now = Date.now();
    db.prepare(
      `UPDATE pomodoro_presets SET name = ?, mode = ?, duration_min = ?, update_time = ? WHERE id = ?`,
    ).run(
      payload.name ?? cur.name,
      (payload.mode ?? cur.mode) as string,
      payload.durationMin ?? cur.durationMin,
      now,
      payload.id,
    );
    const res = this.getById(db, payload.id);
    if (!res) throw new Error("failed to fetch updated pomodoro preset");
    return res;
  }

  static archive(
    db: Database.Database,
    payload: { id: number; archived: boolean },
  ): number {
    const now = Date.now();
    return db
      .prepare(
        `UPDATE pomodoro_presets SET archived = ?, update_time = ? WHERE id = ?`,
      )
      .run(payload.archived ? 1 : 0, now, payload.id).changes;
  }

  static reorder(
    db: Database.Database,
    payload: { orderedIds: number[] },
  ): number {
    const upd = db.prepare(
      `UPDATE pomodoro_presets SET sort_order = ?, update_time = ? WHERE id = ?`,
    );
    const now = Date.now();
    payload.orderedIds.forEach((id, idx) => {
      upd.run((idx + 1) * 1024, now, id);
    });
    return payload.orderedIds.length;
  }

  static remove(db: Database.Database, id: number): number {
    const stmt = db.prepare(`DELETE FROM pomodoro_presets WHERE id = ?`);
    const res = stmt.run(id);
    return res.changes;
  }
}

export default PomodoroPresetTable;
