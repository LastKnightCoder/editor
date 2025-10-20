import Database from "better-sqlite3";

export interface QuestionGroupRow {
  id: number;
  title: string;
  color: string | null;
  sort_index: number;
  is_default: number; // 0/1
  create_time: number;
  update_time: number;
}

export interface QuestionGroup {
  id: number;
  title: string;
  color?: string;
  sortIndex: number;
  isDefault: boolean;
  createTime: number;
  updateTime: number;
}

export interface CreateQuestionGroupPayload {
  title: string;
  color?: string;
}

export interface UpdateQuestionGroupPayload {
  id: number;
  title?: string;
  color?: string;
  sortIndex?: number;
}

export default class QuestionGroupTable {
  static initTable(db: Database.Database) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS question_group (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        color TEXT,
        sort_index INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );`,
    );

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_question_group_sort ON question_group(sort_index);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_question_group_default ON question_group(is_default);`,
    );
  }

  static upgradeTable(db: Database.Database) {
    // 保证至少存在一个默认分组“未分类”
    const row = db
      .prepare(`SELECT id FROM question_group WHERE is_default = 1 LIMIT 1`)
      .get() as { id?: number } | undefined;
    if (!row || !row.id) {
      const now = Date.now();
      const insert = db.prepare(
        `INSERT INTO question_group (title, color, sort_index, is_default, create_time, update_time)
         VALUES (?, ?, ?, 1, ?, ?)`,
      );
      // 默认颜色灰色
      insert.run("未分类", "#9CA3AF", 0, now, now);
    }
  }

  static getListenEvents() {
    return {
      "question-group:list": this.listGroups.bind(this),
      "question-group:create": this.createGroup.bind(this),
      "question-group:update": this.updateGroup.bind(this),
      "question-group:delete": this.deleteGroup.bind(this),
      "question-group:reorder": this.reorderGroups.bind(this),
      "question-group:get-stats": this.getGroupStats.bind(this),
      "question-group:get-default": this.getDefaultGroup.bind(this),
    } as const;
  }

  static parse(row: QuestionGroupRow): QuestionGroup {
    return {
      id: row.id,
      title: row.title,
      color: row.color ?? undefined,
      sortIndex: row.sort_index,
      isDefault: !!row.is_default,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static listGroups(db: Database.Database): QuestionGroup[] {
    const rows = db
      .prepare(
        `SELECT * FROM question_group ORDER BY sort_index ASC, create_time ASC`,
      )
      .all() as QuestionGroupRow[];
    return rows.map(this.parse);
  }

  static getDefaultGroup(db: Database.Database): QuestionGroup {
    const row = db
      .prepare(`SELECT * FROM question_group WHERE is_default = 1 LIMIT 1`)
      .get() as QuestionGroupRow | undefined;

    // 如果没有找到默认分组，创建一个
    if (!row) {
      const now = Date.now();
      const insert = db.prepare(
        `INSERT INTO question_group (title, color, sort_index, is_default, create_time, update_time)
         VALUES (?, ?, ?, 1, ?, ?)`,
      );
      insert.run("未分类", "#9CA3AF", 0, now, now);

      // 重新查询
      const newRow = db
        .prepare(`SELECT * FROM question_group WHERE is_default = 1 LIMIT 1`)
        .get() as QuestionGroupRow;
      return this.parse(newRow);
    }

    return this.parse(row);
  }

  static getGroupById(db: Database.Database, id: number): QuestionGroup | null {
    const row = db
      .prepare(`SELECT * FROM question_group WHERE id = ?`)
      .get(id) as QuestionGroupRow | undefined;
    return row ? this.parse(row) : null;
  }

  static getMaxSortIndex(db: Database.Database): number {
    const row = db
      .prepare(`SELECT MAX(sort_index) AS max_idx FROM question_group`)
      .get() as { max_idx: number | null };
    return row?.max_idx ?? 0;
  }

  static createGroup(
    db: Database.Database,
    payload: CreateQuestionGroupPayload,
  ): QuestionGroup | null {
    const now = Date.now();
    const sortIndex = this.getMaxSortIndex(db) + 1024;
    const insert = db.prepare(
      `INSERT INTO question_group (title, color, sort_index, is_default, create_time, update_time)
       VALUES (?, ?, ?, 0, ?, ?)`,
    );
    const res = insert.run(
      payload.title,
      payload.color ?? null,
      sortIndex,
      now,
      now,
    );
    const id = Number(res.lastInsertRowid);
    return this.getGroupById(db, id);
  }

  static updateGroup(
    db: Database.Database,
    payload: UpdateQuestionGroupPayload,
  ): QuestionGroup {
    const now = Date.now();
    const cur = db
      .prepare(`SELECT * FROM question_group WHERE id = ?`)
      .get(payload.id) as QuestionGroupRow | undefined;
    if (!cur) throw new Error("question_group not found");

    const isDefault = !!cur.is_default;
    const title = isDefault ? cur.title : (payload.title ?? cur.title);
    const color =
      (payload.color === undefined ? cur.color : payload.color) ?? null;
    const sortIndex = payload.sortIndex ?? cur.sort_index;

    db.prepare(
      `UPDATE question_group SET title = ?, color = ?, sort_index = ?, update_time = ? WHERE id = ?`,
    ).run(title, color, sortIndex, now, payload.id);

    const row = db
      .prepare(`SELECT * FROM question_group WHERE id = ?`)
      .get(payload.id) as QuestionGroupRow;
    return this.parse(row);
  }

  static deleteGroup(db: Database.Database, id: number): number {
    const cur = db
      .prepare(`SELECT * FROM question_group WHERE id = ?`)
      .get(id) as QuestionGroupRow | undefined;
    if (!cur) return 0;
    if (cur.is_default) throw new Error("默认分组不可删除");

    // 将该分组的问题迁移到默认分组
    const def = db
      .prepare(`SELECT id FROM question_group WHERE is_default = 1 LIMIT 1`)
      .get() as { id: number };
    db.prepare(`UPDATE questions SET group_id = ? WHERE group_id = ?`).run(
      def.id,
      id,
    );

    const res = db.prepare(`DELETE FROM question_group WHERE id = ?`).run(id);
    return res.changes;
  }

  static reorderGroups(
    db: Database.Database,
    params: { orderedIds: number[] },
  ): number {
    const ids = params.orderedIds;
    const step = 1024;
    const upd = db.prepare(
      `UPDATE question_group SET sort_index = ?, update_time = ? WHERE id = ?`,
    );
    const now = Date.now();
    ids.forEach((id, idx) => {
      upd.run((idx + 1) * step, now, id);
    });
    return ids.length;
  }

  static getGroupStats(db: Database.Database): {
    groupId: number;
    total: number;
    answered: number;
    unanswered: number;
  }[] {
    const rows = db
      .prepare(
        `SELECT 
           group_id as groupId,
           COUNT(*) as total,
           SUM(CASE WHEN answers <> '[]' THEN 1 ELSE 0 END) as answered,
           SUM(CASE WHEN answers = '[]' THEN 1 ELSE 0 END) as unanswered
         FROM questions
         GROUP BY group_id`,
      )
      .all() as any[];

    return rows.map((r) => ({
      groupId: Number(r.groupId),
      total: Number(r.total || 0),
      answered: Number(r.answered || 0),
      unanswered: Number(r.unanswered || 0),
    }));
  }
}
