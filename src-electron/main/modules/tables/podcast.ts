import Database from "better-sqlite3";
import Operation from "./operation";
import ResourceTable from "./resource";

export interface IPodcast {
  id: number;
  name?: string;
  createTime: number;
  updateTime: number;
  audioUrl: string;
  script: string;
  scriptLines: Array<{
    speaker: string;
    text: string;
    startTime: number;
    duration: number;
    voiceId?: string;
  }>;
  duration: number;
  speakers: Array<{
    name: string;
    voiceId: string;
    voiceName: string;
    role?: string;
  }>;
  refCount: number;
}

export interface ICreatePodcast {
  name?: string;
  audioUrl: string;
  script: string;
  scriptLines: Array<{
    speaker: string;
    text: string;
    startTime: number;
    duration: number;
    voiceId?: string;
  }>;
  duration: number;
  speakers: Array<{
    name: string;
    voiceId: string;
    voiceName: string;
    role?: string;
  }>;
}

export default class PodcastTable {
  static getListenEvents() {
    return {
      "podcast:create": this.createPodcast.bind(this),
      "podcast:get-by-id": this.getPodcastById.bind(this),
      "podcast:update-name": this.updateName.bind(this),
      "podcast:delete": this.deletePodcast.bind(this),
      "podcast:increment-ref-count": this.incrementRefCount.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS podcasts (
        id INTEGER PRIMARY KEY,
        name TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        audio_url TEXT NOT NULL,
        script TEXT,
        script_lines TEXT,
        duration INTEGER,
        speakers TEXT NOT NULL,
        ref_count INTEGER DEFAULT 0
      )
    `;
    db.exec(createTableSql);

    // 添加索引
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_podcasts_ref_count ON podcasts(ref_count);
    `;
    db.exec(createIndexSql);
  }

  static upgradeTable(db: Database.Database) {
    // 检查是否存在 name 字段
    const tableInfo = db.prepare("PRAGMA table_info(podcasts)").all() as Array<{
      name: string;
    }>;
    const hasNameColumn = tableInfo.some((col) => col.name === "name");

    if (!hasNameColumn) {
      db.exec("ALTER TABLE podcasts ADD COLUMN name TEXT");
    }

    // 检查是否存在 script_lines 字段
    const hasScriptLinesColumn = tableInfo.some(
      (col) => col.name === "script_lines",
    );
    if (!hasScriptLinesColumn) {
      db.exec("ALTER TABLE podcasts ADD COLUMN script_lines TEXT");
    }
  }

  static parsePodcast(row: unknown): IPodcast {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    return {
      id: r.id,
      name: r.name || undefined,
      createTime: r.create_time,
      updateTime: r.update_time,
      audioUrl: r.audio_url,
      script: r.script || "",
      scriptLines: r.script_lines ? JSON.parse(r.script_lines) : [],
      duration: r.duration || 0,
      speakers: JSON.parse(r.speakers),
      refCount: r.ref_count || 0,
    };
  }

  static createPodcast(db: Database.Database, data: ICreatePodcast): IPodcast {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO podcasts 
      (name, create_time, update_time, audio_url, script, script_lines, duration, speakers, ref_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      data.name || null,
      now,
      now,
      data.audioUrl,
      data.script,
      JSON.stringify(data.scriptLines || []),
      data.duration,
      JSON.stringify(data.speakers),
      1, // 初始引用计数为 1
    );

    const createdPodcastId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "podcast", "insert", createdPodcastId, now);

    const podcast = this.getPodcastById(db, createdPodcastId);
    if (!podcast) {
      throw new Error("Failed to create podcast");
    }
    return podcast;
  }

  static getPodcastById(
    db: Database.Database,
    podcastId: number,
  ): IPodcast | null {
    const stmt = db.prepare("SELECT * FROM podcasts WHERE id = ?");
    const row = stmt.get(podcastId);
    if (!row) {
      return null;
    }
    return this.parsePodcast(row);
  }

  static deletePodcast(db: Database.Database, podcastId: number): number {
    // 先减少引用计数
    const decrementStmt = db.prepare(
      "UPDATE podcasts SET ref_count = ref_count - 1 WHERE id = ?",
    );
    decrementStmt.run(podcastId);

    // 查询当前引用计数
    const refCountStmt = db.prepare(
      "SELECT ref_count FROM podcasts WHERE id = ?",
    );
    const result = refCountStmt.get(podcastId) as
      | { ref_count: number }
      | undefined;

    // 如果引用计数为 0，则删除
    if (result && result.ref_count <= 0) {
      // 先获取 podcast 信息，减少资源引用计数
      const podcast = this.getPodcastById(db, podcastId);
      if (podcast?.audioUrl) {
        ResourceTable.decrementRefCount(db, podcast.audioUrl);
      }

      const deleteStmt = db.prepare("DELETE FROM podcasts WHERE id = ?");
      Operation.insertOperation(db, "podcast", "delete", podcastId, Date.now());
      return deleteStmt.run(podcastId).changes;
    }

    return 0;
  }

  static incrementRefCount(db: Database.Database, podcastId: number): void {
    const stmt = db.prepare(
      "UPDATE podcasts SET ref_count = ref_count + 1 WHERE id = ?",
    );
    stmt.run(podcastId);
  }

  static updateName(
    db: Database.Database,
    podcastId: number,
    name: string,
  ): IPodcast | null {
    const now = Date.now();
    const stmt = db.prepare(
      "UPDATE podcasts SET name = ?, update_time = ? WHERE id = ?",
    );
    console.log(name, now, podcastId);
    stmt.run(name, now, podcastId);
    Operation.insertOperation(db, "podcast", "update", podcastId, now);
    return this.getPodcastById(db, podcastId);
  }
}
