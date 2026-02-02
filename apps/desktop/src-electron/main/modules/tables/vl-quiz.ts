import Database from "better-sqlite3";
import log from "electron-log";

// 类型定义
interface VLQuizSet {
  id: number;
  projectId: number;
  name: string;
  description: string;
  emoji: string;
  resourceIds: number[];
  prompt: string | null;
  itemCount: number;
  createTime: number;
  updateTime: number;
}

interface CreateVLQuizSetInput {
  projectId: number;
  name: string;
  description?: string;
  emoji?: string;
  resourceIds?: number[];
  prompt?: string;
}

interface UpdateVLQuizSetInput {
  id: number;
  name?: string;
  description?: string;
  emoji?: string;
  resourceIds?: number[];
  prompt?: string;
}

interface VLQuizItem {
  id: number;
  quizSetId: number;
  type: string;
  prompt: any[];
  detail: any[];
  data: Record<string, unknown>;
  tags: string[];
  difficulty: string;
  sortOrder: number;
  createTime: number;
  updateTime: number;
}

interface CreateVLQuizItemInput {
  quizSetId: number;
  type: string;
  prompt: any[];
  detail?: any[];
  data: Record<string, unknown>;
  tags?: string[];
  difficulty?: string;
  sortOrder?: number;
}

interface UpdateVLQuizItemInput {
  id: number;
  type?: string;
  prompt?: any[];
  detail?: any[];
  data?: Record<string, unknown>;
  tags?: string[];
  difficulty?: string;
  sortOrder?: number;
}

interface QuizAnswerRecord {
  itemId: number;
  userAnswer: unknown;
  isCorrect: boolean;
  score: number;
  duration: number;
}

interface VLQuizRecord {
  id: number;
  quizSetId: number;
  projectId: number;
  score: number;
  correctCount: number;
  totalCount: number;
  answers: QuizAnswerRecord[];
  duration: number;
  createTime: number;
}

interface CreateVLQuizRecordInput {
  quizSetId: number;
  projectId: number;
  score: number;
  correctCount: number;
  totalCount: number;
  answers: QuizAnswerRecord[];
  duration: number;
}

// 数据库行类型
type QuizSetRow = {
  id: number;
  project_id: number;
  name: string;
  description: string;
  emoji: string;
  resource_ids: string;
  prompt: string | null;
  create_time: number;
  update_time: number;
};

type QuizItemRow = {
  id: number;
  quiz_set_id: number;
  type: string;
  prompt: string;
  detail: string;
  data: string;
  tags: string;
  difficulty: string;
  sort_order: number;
  create_time: number;
  update_time: number;
};

type QuizRecordRow = {
  id: number;
  quiz_set_id: number;
  project_id: number;
  score: number;
  correct_count: number;
  total_count: number;
  answers: string;
  duration: number;
  create_time: number;
};

const DEFAULT_EMOJI = "📝";

class VLQuizTable {
  static getListenEvents() {
    return {
      "vl-quiz:list-sets": this.listQuizSets.bind(this),
      "vl-quiz:get-set": this.getQuizSet.bind(this),
      "vl-quiz:create-set": this.createQuizSet.bind(this),
      "vl-quiz:update-set": this.updateQuizSet.bind(this),
      "vl-quiz:delete-set": this.deleteQuizSet.bind(this),
      "vl-quiz:list-items": this.listQuizItems.bind(this),
      "vl-quiz:get-item": this.getQuizItem.bind(this),
      "vl-quiz:create-item": this.createQuizItem.bind(this),
      "vl-quiz:create-items-batch": this.createQuizItemsBatch.bind(this),
      "vl-quiz:update-item": this.updateQuizItem.bind(this),
      "vl-quiz:delete-item": this.deleteQuizItem.bind(this),
      "vl-quiz:list-records": this.listQuizRecords.bind(this),
      "vl-quiz:get-record": this.getQuizRecord.bind(this),
      "vl-quiz:create-record": this.createQuizRecord.bind(this),
      "vl-quiz:delete-record": this.deleteQuizRecord.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    // 测验集表
    db.exec(`
      CREATE TABLE IF NOT EXISTS vl_quiz_set (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        emoji TEXT DEFAULT '${DEFAULT_EMOJI}',
        resource_ids TEXT DEFAULT '[]',
        prompt TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
    `);

    // 测验题表
    db.exec(`
      CREATE TABLE IF NOT EXISTS vl_quiz_item (
        id INTEGER PRIMARY KEY,
        quiz_set_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        detail TEXT DEFAULT '[]',
        data TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        difficulty TEXT DEFAULT 'standard',
        sort_order INTEGER DEFAULT 0,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        FOREIGN KEY(quiz_set_id) REFERENCES vl_quiz_set(id)
      );
    `);

    // 测验记录表
    db.exec(`
      CREATE TABLE IF NOT EXISTS vl_quiz_record (
        id INTEGER PRIMARY KEY,
        quiz_set_id INTEGER NOT NULL,
        project_id INTEGER NOT NULL,
        score REAL NOT NULL,
        correct_count INTEGER NOT NULL,
        total_count INTEGER NOT NULL,
        answers TEXT NOT NULL,
        duration INTEGER NOT NULL,
        create_time INTEGER NOT NULL,
        FOREIGN KEY(quiz_set_id) REFERENCES vl_quiz_set(id)
      );
    `);

    // 索引
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_vl_quiz_set_project ON vl_quiz_set(project_id);",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_vl_quiz_item_set ON vl_quiz_item(quiz_set_id);",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_vl_quiz_record_set ON vl_quiz_record(quiz_set_id);",
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_vl_quiz_record_project ON vl_quiz_record(project_id);",
    );
  }

  static upgradeTable(_db: Database.Database) {
    // 预留增量更新
  }

  private static parseJSON<T>(
    value: string | null | undefined,
    fallback: T,
  ): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      log.error("[VLQuizTable] Failed to parse JSON", error);
      return fallback;
    }
  }

  private static getItemCount(
    db: Database.Database,
    quizSetId: number,
  ): number {
    const result = db
      .prepare(
        `SELECT COUNT(*) as count FROM vl_quiz_item WHERE quiz_set_id = ?`,
      )
      .get(quizSetId) as { count: number };
    return result?.count ?? 0;
  }

  private static mapQuizSetRow(row: QuizSetRow, itemCount: number): VLQuizSet {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description || "",
      emoji: row.emoji || DEFAULT_EMOJI,
      resourceIds: this.parseJSON<number[]>(row.resource_ids, []),
      prompt: row.prompt,
      itemCount,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  private static mapQuizItemRow(row: QuizItemRow): VLQuizItem {
    // 解析 prompt 为 Descendant[]
    let prompt: any[];
    try {
      prompt = JSON.parse(row.prompt);
      if (!Array.isArray(prompt)) {
        prompt = [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: row.prompt || "" }],
          },
        ];
      }
    } catch {
      prompt = [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: row.prompt || "" }],
        },
      ];
    }

    // 解析 detail 为 Descendant[]
    let detail: any[];
    try {
      detail = JSON.parse(row.detail);
      if (!Array.isArray(detail)) {
        detail = [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
        ];
      }
    } catch {
      detail = [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "" }],
        },
      ];
    }

    return {
      id: row.id,
      quizSetId: row.quiz_set_id,
      type: row.type,
      prompt,
      detail,
      data: this.parseJSON(row.data, {}),
      tags: this.parseJSON<string[]>(row.tags, []),
      difficulty: row.difficulty || "standard",
      sortOrder: row.sort_order ?? 0,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  private static mapQuizRecordRow(row: QuizRecordRow): VLQuizRecord {
    return {
      id: row.id,
      quizSetId: row.quiz_set_id,
      projectId: row.project_id,
      score: row.score,
      correctCount: row.correct_count,
      totalCount: row.total_count,
      answers: this.parseJSON<QuizAnswerRecord[]>(row.answers, []),
      duration: row.duration,
      createTime: row.create_time,
    };
  }

  // ========== Quiz Set CRUD ==========

  static listQuizSets(db: Database.Database, projectId: number): VLQuizSet[] {
    const rows = db
      .prepare(
        `SELECT * FROM vl_quiz_set WHERE project_id = ? ORDER BY update_time DESC`,
      )
      .all(projectId) as QuizSetRow[];

    return rows.map((row) => {
      const itemCount = this.getItemCount(db, row.id);
      return this.mapQuizSetRow(row, itemCount);
    });
  }

  static getQuizSet(db: Database.Database, id: number): VLQuizSet | null {
    const row = db.prepare(`SELECT * FROM vl_quiz_set WHERE id = ?`).get(id) as
      | QuizSetRow
      | undefined;
    if (!row) return null;
    const itemCount = this.getItemCount(db, id);
    return this.mapQuizSetRow(row, itemCount);
  }

  static createQuizSet(
    db: Database.Database,
    payload: CreateVLQuizSetInput,
  ): VLQuizSet {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO vl_quiz_set (project_id, name, description, emoji, resource_ids, prompt, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      payload.projectId,
      payload.name,
      payload.description ?? "",
      payload.emoji ?? DEFAULT_EMOJI,
      JSON.stringify(payload.resourceIds ?? []),
      payload.prompt ?? null,
      now,
      now,
    );
    return this.getQuizSet(db, Number(res.lastInsertRowid)) as VLQuizSet;
  }

  static updateQuizSet(
    db: Database.Database,
    payload: UpdateVLQuizSetInput,
  ): VLQuizSet | null {
    const existing = this.getQuizSet(db, payload.id);
    if (!existing) return null;

    const now = Date.now();
    db.prepare(
      `UPDATE vl_quiz_set 
       SET name = ?, description = ?, emoji = ?, resource_ids = ?, prompt = ?, update_time = ?
       WHERE id = ?`,
    ).run(
      payload.name ?? existing.name,
      payload.description ?? existing.description,
      payload.emoji ?? existing.emoji,
      payload.resourceIds
        ? JSON.stringify(payload.resourceIds)
        : JSON.stringify(existing.resourceIds),
      payload.prompt !== undefined ? payload.prompt : existing.prompt,
      now,
      payload.id,
    );

    return this.getQuizSet(db, payload.id);
  }

  static deleteQuizSet(db: Database.Database, id: number): boolean {
    // 删除关联的测验题
    db.prepare(`DELETE FROM vl_quiz_item WHERE quiz_set_id = ?`).run(id);
    // 删除关联的测验记录
    db.prepare(`DELETE FROM vl_quiz_record WHERE quiz_set_id = ?`).run(id);
    // 删除测验集
    const result = db.prepare(`DELETE FROM vl_quiz_set WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  // ========== Quiz Item CRUD ==========

  static listQuizItems(db: Database.Database, quizSetId: number): VLQuizItem[] {
    const rows = db
      .prepare(
        `SELECT * FROM vl_quiz_item WHERE quiz_set_id = ? ORDER BY sort_order ASC, create_time ASC`,
      )
      .all(quizSetId) as QuizItemRow[];
    return rows.map((row) => this.mapQuizItemRow(row));
  }

  static getQuizItem(db: Database.Database, id: number): VLQuizItem | null {
    const row = db
      .prepare(`SELECT * FROM vl_quiz_item WHERE id = ?`)
      .get(id) as QuizItemRow | undefined;
    if (!row) return null;
    return this.mapQuizItemRow(row);
  }

  static createQuizItem(
    db: Database.Database,
    payload: CreateVLQuizItemInput,
  ): VLQuizItem {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO vl_quiz_item (quiz_set_id, type, prompt, detail, data, tags, difficulty, sort_order, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const promptJson = JSON.stringify(payload.prompt);
    const detailJson = JSON.stringify(
      payload.detail ?? [
        { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      ],
    );

    const res = stmt.run(
      payload.quizSetId,
      payload.type,
      promptJson,
      detailJson,
      JSON.stringify(payload.data ?? {}),
      JSON.stringify(payload.tags ?? []),
      payload.difficulty ?? "standard",
      payload.sortOrder ?? 0,
      now,
      now,
    );

    return this.getQuizItem(db, Number(res.lastInsertRowid)) as VLQuizItem;
  }

  static createQuizItemsBatch(
    db: Database.Database,
    items: CreateVLQuizItemInput[],
  ): VLQuizItem[] {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO vl_quiz_item (quiz_set_id, type, prompt, detail, data, tags, difficulty, sort_order, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdIds: number[] = [];

    for (let i = 0; i < items.length; i++) {
      const payload = items[i];
      const promptJson = JSON.stringify(payload.prompt);
      const detailJson = JSON.stringify(
        payload.detail ?? [
          { type: "paragraph", children: [{ type: "formatted", text: "" }] },
        ],
      );

      const res = stmt.run(
        payload.quizSetId,
        payload.type,
        promptJson,
        detailJson,
        JSON.stringify(payload.data ?? {}),
        JSON.stringify(payload.tags ?? []),
        payload.difficulty ?? "standard",
        payload.sortOrder ?? i,
        now,
        now,
      );

      createdIds.push(Number(res.lastInsertRowid));
    }

    return createdIds
      .map((id) => this.getQuizItem(db, id))
      .filter((item): item is VLQuizItem => item !== null);
  }

  static updateQuizItem(
    db: Database.Database,
    payload: UpdateVLQuizItemInput,
  ): VLQuizItem | null {
    const existingRow = db
      .prepare(`SELECT * FROM vl_quiz_item WHERE id = ?`)
      .get(payload.id) as QuizItemRow | undefined;
    if (!existingRow) return null;

    const now = Date.now();

    const promptJson = payload.prompt
      ? JSON.stringify(payload.prompt)
      : existingRow.prompt;
    const detailJson = payload.detail
      ? JSON.stringify(payload.detail)
      : existingRow.detail;

    db.prepare(
      `UPDATE vl_quiz_item SET
        type = ?,
        prompt = ?,
        detail = ?,
        data = ?,
        tags = ?,
        difficulty = ?,
        sort_order = ?,
        update_time = ?
       WHERE id = ?`,
    ).run(
      payload.type ?? existingRow.type,
      promptJson,
      detailJson,
      payload.data ? JSON.stringify(payload.data) : existingRow.data,
      payload.tags ? JSON.stringify(payload.tags) : existingRow.tags,
      payload.difficulty ?? existingRow.difficulty,
      payload.sortOrder ?? existingRow.sort_order,
      now,
      payload.id,
    );

    return this.getQuizItem(db, payload.id);
  }

  static deleteQuizItem(db: Database.Database, id: number): boolean {
    const result = db.prepare(`DELETE FROM vl_quiz_item WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  // ========== Quiz Record CRUD ==========

  static listQuizRecords(
    db: Database.Database,
    params: { quizSetId?: number; projectId?: number },
  ): VLQuizRecord[] {
    const conditions: string[] = ["1=1"];
    const values: any[] = [];

    if (params.quizSetId !== undefined) {
      conditions.push("quiz_set_id = ?");
      values.push(params.quizSetId);
    }

    if (params.projectId !== undefined) {
      conditions.push("project_id = ?");
      values.push(params.projectId);
    }

    const rows = db
      .prepare(
        `SELECT * FROM vl_quiz_record WHERE ${conditions.join(" AND ")} ORDER BY create_time DESC`,
      )
      .all(...values) as QuizRecordRow[];

    return rows.map((row) => this.mapQuizRecordRow(row));
  }

  static getQuizRecord(db: Database.Database, id: number): VLQuizRecord | null {
    const row = db
      .prepare(`SELECT * FROM vl_quiz_record WHERE id = ?`)
      .get(id) as QuizRecordRow | undefined;
    if (!row) return null;
    return this.mapQuizRecordRow(row);
  }

  static createQuizRecord(
    db: Database.Database,
    payload: CreateVLQuizRecordInput,
  ): VLQuizRecord {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO vl_quiz_record (quiz_set_id, project_id, score, correct_count, total_count, answers, duration, create_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      payload.quizSetId,
      payload.projectId,
      payload.score,
      payload.correctCount,
      payload.totalCount,
      JSON.stringify(payload.answers),
      payload.duration,
      now,
    );
    return this.getQuizRecord(db, Number(res.lastInsertRowid)) as VLQuizRecord;
  }

  static deleteQuizRecord(db: Database.Database, id: number): boolean {
    const result = db
      .prepare(`DELETE FROM vl_quiz_record WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }
}

export default VLQuizTable;
