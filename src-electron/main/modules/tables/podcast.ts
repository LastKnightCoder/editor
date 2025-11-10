import Database from "better-sqlite3";
import Operation from "./operation";
import ResourceTable from "./resource";

export interface IPodcast {
  id: number;
  createTime: number;
  updateTime: number;
  audioUrl: string;
  script: string;
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
  audioUrl: string;
  script: string;
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
      "podcast:delete": this.deletePodcast.bind(this),
      "podcast:increment-ref-count": this.incrementRefCount.bind(this),
    };
  }

  static initTable(db: Database.Database) {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS podcasts (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        audio_url TEXT NOT NULL,
        script TEXT,
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

  static upgradeTable() {
    // 未来的表升级逻辑
  }

  static parsePodcast(row: unknown): IPodcast {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    return {
      id: r.id,
      createTime: r.create_time,
      updateTime: r.update_time,
      audioUrl: r.audio_url,
      script: r.script || "",
      duration: r.duration || 0,
      speakers: JSON.parse(r.speakers),
      refCount: r.ref_count || 0,
    };
  }

  static createPodcast(db: Database.Database, data: ICreatePodcast): IPodcast {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO podcasts 
      (create_time, update_time, audio_url, script, duration, speakers, ref_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      now,
      now,
      data.audioUrl,
      data.script,
      data.duration,
      JSON.stringify(data.speakers),
      1, // 初始引用计数为 1
    );

    const createdPodcastId = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "podcast", "insert", createdPodcastId, now);

    return this.getPodcastById(db, createdPodcastId)!;
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
}
