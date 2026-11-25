import type Database from "better-sqlite3";

/** 主库投影的身份目录准备；每批进度和身份一起提交，重开可继续。 */
export default class DocumentTaskIdentitiesTable {
  static prepare(db: Database.Database, batchSize = 100): boolean {
    return db.transaction(() => {
      const state = db
        .prepare(
          "SELECT ready,after_content_id FROM document_task_projection_state WHERE id='main'"
        )
        .get() as { ready: number; after_content_id: number };
      if (state.ready) return true;
      const rows = db
        .prepare("SELECT id FROM contents WHERE id>? ORDER BY id LIMIT ?")
        .all(state.after_content_id, batchSize) as { id: number }[];
      if (!rows.length) {
        db.prepare("UPDATE document_task_projection_state SET ready=1 WHERE id='main'").run();
        return true;
      }
      const through = rows[rows.length - 1].id;
      db.prepare(
        "INSERT OR REPLACE INTO document_task_projection_errors SELECT content_id,part_key,reason FROM document_task_invalid_parts WHERE content_id>? AND content_id<=?"
      ).run(state.after_content_id, through);
      db.prepare(`INSERT OR IGNORE INTO document_task_identities(content_id,content_created_at,part_key,task_id)
        SELECT p.content_id,p.content_created_at,p.part_key,p.task_id FROM document_task_projection_candidates p
        WHERE p.content_id>? AND p.content_id<=? AND NOT EXISTS(SELECT 1 FROM document_task_projection_errors e WHERE e.content_id=p.content_id AND e.part_key=p.part_key)`).run(
        state.after_content_id,
        through
      );
      db.prepare(
        "UPDATE document_task_projection_state SET after_content_id=? WHERE id='main'"
      ).run(through);
      return false;
    })();
  }
  static requireReady(db: Database.Database): string {
    const state = db
      .prepare("SELECT ready,epoch FROM document_task_projection_state WHERE id='main'")
      .get() as { ready: number; epoch: string } | undefined;
    if (!state?.ready) throw new Error("正文任务身份目录正在准备，请稍后重试");
    const error = db
      .prepare(`SELECT e.content_id,e.reason FROM document_task_projection_errors e
      WHERE EXISTS(SELECT 1 FROM document_task_source_contents s WHERE s.content_id=e.content_id)
      AND NOT EXISTS(SELECT 1 FROM doc_task_settings s WHERE s.content_id=e.content_id AND s.kind='excluded') LIMIT 1`)
      .get() as { content_id: number; reason: string } | undefined;
    if (error)
      throw new Error(
        `正文 ${error.content_id} 的任务身份尚未完整解析：${error.reason}，请修复原文后重试`
      );
    return state.epoch;
  }
}
