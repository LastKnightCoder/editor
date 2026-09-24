import { readKnowledgeMapping, type MigrationDatabase } from "./knowledge-migration";

/** 迁移派生索引身份并复用向量，避免仅为改实体类型重新请求嵌入模型。 */
export function migrateKnowledgeIndex(main: MigrationDatabase, index: MigrationDatabase) {
  const mapping = readKnowledgeMapping(main);
  if (!mapping) return;
  const ordered = (entries: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(entries).sort(([left], [right]) => Number(left) - Number(right))
    );
  const fingerprint = JSON.stringify({
    projects: ordered(mapping.projects),
    items: ordered(mapping.items),
  });
  const key = "knowledge-to-project:index-v1";
  const exists = (table: string) =>
    !!index.prepare("SELECT 1 FROM sqlite_master WHERE name=? AND type='table'").get(table);
  if (!exists("index_meta")) return;
  if (index.prepare("SELECT value FROM index_meta WHERE key=?").get(key)?.value === fingerprint)
    return;
  index.exec("BEGIN IMMEDIATE");
  try {
    for (const table of ["content_fts", "vec_documents"]) {
      if (!exists(table)) continue;
      for (const [before, after] of Object.entries(mapping.items)) {
        const target = `project-item:${after}`;
        const source = `document-item:${before}`;
        index.prepare(`DELETE FROM ${table} WHERE prefixed_id=?`).run(target);
        if (table === "content_fts") {
          index
            .prepare("UPDATE content_fts SET prefixed_id=?,type='project-item' WHERE prefixed_id=?")
            .run(target, source);
        } else {
          index
            .prepare(
              "INSERT INTO vec_documents(prefixed_id,update_time,content,type,vec_embedding) SELECT ?,update_time,content,'project-item',vec_embedding FROM vec_documents WHERE prefixed_id=?"
            )
            .run(target, source);
        }
      }
      index.prepare(`DELETE FROM ${table} WHERE type='document-item'`).run();
    }
    index
      .prepare(
        "INSERT INTO index_meta(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at"
      )
      .run(key, fingerprint, Date.now());
    index.exec("COMMIT");
  } catch (error) {
    index.exec("ROLLBACK");
    throw error;
  }
}
