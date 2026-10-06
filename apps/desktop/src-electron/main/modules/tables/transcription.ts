import Database from "better-sqlite3";
import Operation from "./operation";

export interface ITranscriptionSegment {
  text: string;
  start: number; // 毫秒
  end: number; // 毫秒
}

export interface ITranscription {
  id: number;
  sourceType: "audio" | "video"; // 来源类型
  sourceId?: number; // 关联的资源 ID（可选）
  sourcePath: string; // 源文件路径
  createTime: number;
  updateTime: number;
  text: string; // 完整文本
  language: string; // 检测到的语言
  languageProbability: number; // 语言检测置信度
  duration: number; // 音频时长（秒）
  processingTime: number; // 处理耗时（秒）
  modelSize: string; // 使用的模型大小
  segments: ITranscriptionSegment[]; // 句级时间戳
  wordSegments?: ITranscriptionSegment[]; // 词级时间戳（可选）
  refCount: number;
}

export interface ICreateTranscription {
  sourceType: "audio" | "video";
  sourceId?: number;
  sourcePath: string;
  text: string;
  language: string;
  languageProbability: number;
  duration: number;
  processingTime: number;
  modelSize: string;
  segments: ITranscriptionSegment[];
  wordSegments?: ITranscriptionSegment[];
}

export interface IUpdateTranscription {
  text?: string;
  segments?: ITranscriptionSegment[];
  wordSegments?: ITranscriptionSegment[];
}

export default class TranscriptionTable {
  static getListenEvents() {
    return {
      "transcription:create": this.createTranscription.bind(this),
      "transcription:get-by-id": this.getTranscriptionById.bind(this),
      "transcription:get-by-source": this.getTranscriptionBySource.bind(this),
      "transcription:update": this.updateTranscription.bind(this),
      "transcription:delete": this.deleteTranscription.bind(this),
      "transcription:get-all": this.getAllTranscriptions.bind(this),
      "transcription:increment-ref-count": this.incrementRefCount.bind(this),
    };
  }
  static parseTranscription(row: unknown): ITranscription {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    return {
      id: r.id,
      sourceType: r.source_type,
      sourceId: r.source_id || undefined,
      sourcePath: r.source_path,
      createTime: r.create_time,
      updateTime: r.update_time,
      text: r.text,
      language: r.language,
      languageProbability: r.language_probability,
      duration: r.duration,
      processingTime: r.processing_time,
      modelSize: r.model_size,
      segments: JSON.parse(r.segments),
      wordSegments: r.word_segments ? JSON.parse(r.word_segments) : undefined,
      refCount: r.ref_count || 1,
    };
  }

  static createTranscription(db: Database.Database, data: ICreateTranscription): ITranscription {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO transcriptions
      (source_type, source_id, source_path, create_time, update_time, text, language,
       language_probability, duration, processing_time, model_size, segments, word_segments, ref_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      data.sourceType,
      data.sourceId || null,
      data.sourcePath,
      now,
      now,
      data.text,
      data.language,
      data.languageProbability,
      data.duration,
      data.processingTime,
      data.modelSize,
      JSON.stringify(data.segments),
      data.wordSegments ? JSON.stringify(data.wordSegments) : null,
      1
    );

    const createdId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "transcription", "insert", createdId, now);

    const transcription = this.getTranscriptionById(db, createdId);
    if (!transcription) {
      throw new Error("Failed to create transcription");
    }
    return transcription;
  }

  static getTranscriptionById(db: Database.Database, id: number): ITranscription | null {
    const stmt = db.prepare("SELECT * FROM transcriptions WHERE id = ?");
    const row = stmt.get(id);
    if (!row) {
      return null;
    }
    return this.parseTranscription(row);
  }

  static getTranscriptionBySource(
    db: Database.Database,
    sourcePath: string
  ): ITranscription | null {
    const stmt = db.prepare(
      "SELECT * FROM transcriptions WHERE source_path = ? ORDER BY create_time DESC LIMIT 1"
    );
    const row = stmt.get(sourcePath);
    if (!row) {
      return null;
    }
    return this.parseTranscription(row);
  }

  static getTranscriptionsBySourceId(
    db: Database.Database,
    sourceType: "audio" | "video",
    sourceId: number
  ): ITranscription[] {
    const stmt = db.prepare(
      "SELECT * FROM transcriptions WHERE source_type = ? AND source_id = ? ORDER BY create_time DESC"
    );
    const rows = stmt.all(sourceType, sourceId);
    return rows.map(row => this.parseTranscription(row));
  }

  static getAllTranscriptions(
    db: Database.Database,
    options?: {
      sourceType?: "audio" | "video";
      language?: string;
      limit?: number;
      offset?: number;
    }
  ): ITranscription[] {
    let sql = "SELECT * FROM transcriptions WHERE 1=1";
    const params: (string | number)[] = [];

    if (options?.sourceType) {
      sql += " AND source_type = ?";
      params.push(options.sourceType);
    }

    if (options?.language) {
      sql += " AND language = ?";
      params.push(options.language);
    }

    sql += " ORDER BY create_time DESC";

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);

      if (options?.offset) {
        sql += " OFFSET ?";
        params.push(options.offset);
      }
    }

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(row => this.parseTranscription(row));
  }

  static updateTranscription(
    db: Database.Database,
    id: number,
    data: IUpdateTranscription
  ): ITranscription | null {
    const now = Date.now();
    const updates: string[] = ["update_time = ?"];
    const params: (string | number)[] = [now];

    if (data.text !== undefined) {
      updates.push("text = ?");
      params.push(data.text);
    }

    if (data.segments !== undefined) {
      updates.push("segments = ?");
      params.push(JSON.stringify(data.segments));
    }

    if (data.wordSegments !== undefined) {
      updates.push("word_segments = ?");
      params.push(JSON.stringify(data.wordSegments));
    }

    params.push(id);

    const stmt = db.prepare(`UPDATE transcriptions SET ${updates.join(", ")} WHERE id = ?`);
    stmt.run(...params);

    Operation.insertOperation(db, "transcription", "update", id, now);
    return this.getTranscriptionById(db, id);
  }

  static deleteTranscription(db: Database.Database, id: number): number {
    // 先减少引用计数
    const decrementStmt = db.prepare(
      "UPDATE transcriptions SET ref_count = ref_count - 1 WHERE id = ?"
    );
    decrementStmt.run(id);

    // 查询当前引用计数
    const refCountStmt = db.prepare("SELECT ref_count FROM transcriptions WHERE id = ?");
    const result = refCountStmt.get(id) as { ref_count: number } | undefined;

    // 如果引用计数为 0，则删除
    if (result && result.ref_count <= 0) {
      const deleteStmt = db.prepare("DELETE FROM transcriptions WHERE id = ?");
      Operation.insertOperation(db, "transcription", "delete", id, Date.now());
      return deleteStmt.run(id).changes;
    }

    return 0;
  }

  static incrementRefCount(db: Database.Database, id: number): void {
    const stmt = db.prepare("UPDATE transcriptions SET ref_count = ref_count + 1 WHERE id = ?");
    stmt.run(id);
  }

  static searchTranscriptions(
    db: Database.Database,
    keyword: string,
    options?: {
      sourceType?: "audio" | "video";
      limit?: number;
    }
  ): ITranscription[] {
    let sql = "SELECT * FROM transcriptions WHERE text LIKE ?";
    const params: (string | number)[] = [`%${keyword}%`];

    if (options?.sourceType) {
      sql += " AND source_type = ?";
      params.push(options.sourceType);
    }

    sql += " ORDER BY create_time DESC";

    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(row => this.parseTranscription(row));
  }
}
