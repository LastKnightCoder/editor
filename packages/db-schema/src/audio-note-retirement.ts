import type { MigrationDatabase } from "./knowledge-migration";
import treeSql from "./audio-note-retirement-sql.json";

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const columns = (db: MigrationDatabase, table: string) =>
  new Set(
    db
      .prepare(`PRAGMA table_info(${quote(table)})`)
      .all()
      .map(row => row.name as string)
  );

function audioNoteItemCondition(db: MigrationDatabase): string {
  const fields = columns(db, "project_item");
  return (
    ["project_item_type", "ref_type"]
      .filter(field => fields.has(field))
      .map(field => `${field}='audio-note'`)
      .join(" OR ") || "0"
  );
}

export function hasRetiredAudioItems(db: MigrationDatabase): boolean {
  return (
    columns(db, "project_item").size > 0 &&
    Boolean(
      db.prepare(`SELECT 1 FROM project_item WHERE ${audioNoteItemCondition(db)} LIMIT 1`).get()
    )
  );
}

/** 在调用方的退役事务内释放音频引用并提升普通子节点；SQL 与移动端共用。 */
export function retireAudioNotes(db: MigrationDatabase): void {
  db.exec(`CREATE TEMP TABLE tau_retired_audio_items(id INTEGER PRIMARY KEY,children TEXT,content_id INTEGER);
    CREATE TEMP TABLE tau_retired_audio_contents(content_id INTEGER);`);
  if (hasRetiredAudioItems(db)) {
    db.exec(`INSERT INTO tau_retired_audio_items SELECT id,children,content_id FROM project_item
      WHERE ${audioNoteItemCondition(db)};
      INSERT INTO tau_retired_audio_contents SELECT content_id FROM tau_retired_audio_items WHERE content_id>0;`);
    db.exec(treeSql.join("\n"));
    db.exec(`CREATE TABLE IF NOT EXISTS migration_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT INTO migration_meta(key,value) VALUES('audio-note-retirement:items-v1',
        (SELECT json_group_array(id) FROM (
          SELECT id FROM tau_retired_audio_items UNION
          SELECT CAST(value AS INTEGER) FROM json_each(COALESCE(
            (SELECT value FROM migration_meta WHERE key='audio-note-retirement:items-v1'),'[]'))
          ORDER BY id
        ))) ON CONFLICT(key) DO UPDATE SET value=excluded.value;`);
  }
  if (columns(db, "audio_note_item").has("content_id")) {
    db.exec(
      "INSERT INTO tau_retired_audio_contents SELECT content_id FROM audio_note_item WHERE content_id>0;"
    );
  }
  db.exec("DROP TABLE IF EXISTS audio_note_item; DROP TABLE IF EXISTS audio_notes;");
  if (columns(db, "contents").has("ref_count")) {
    const references: string[] = [];
    const remainingReferences: string[] = [];
    for (const { name } of db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()) {
      for (const field of columns(db, name)) {
        if (
          [
            "content_id",
            "description_content_id",
            "detail_content_id",
            "preferred_content_id",
          ].includes(field)
        ) {
          references.push(
            `NOT EXISTS(SELECT 1 FROM ${quote(name)} WHERE ${quote(field)}=contents.id)`
          );
          remainingReferences.push(
            `(SELECT COUNT(*) FROM ${quote(name)} WHERE ${quote(field)}=contents.id)`
          );
        }
      }
    }
    // 保留未登记的引用计数，并以存量实体引用兜底，避免旧计数不完整时误删共享正文。
    db.exec(`UPDATE contents SET ref_count=MAX(0,COALESCE(ref_count,0)-
      (SELECT COUNT(*) FROM tau_retired_audio_contents WHERE content_id=contents.id),
      ${remainingReferences.length ? remainingReferences.join("+") : "0"})
      WHERE id IN (SELECT content_id FROM tau_retired_audio_contents);
      DELETE FROM contents WHERE id IN (SELECT content_id FROM tau_retired_audio_contents)
      AND ref_count=0 ${references.length ? `AND ${references.join(" AND ")}` : ""};`);
  }
  db.exec("DROP TABLE tau_retired_audio_contents; DROP TABLE tau_retired_audio_items;");
}

/** 派生索引独立落库，保留已被新文档复用的 ID，失败时下次开库重试。 */
export function retireAudioNoteIndexes(main: MigrationDatabase, index: MigrationDatabase): void {
  if (!columns(main, "migration_meta").size || !columns(index, "index_meta").size) return;
  const key = "audio-note-retirement:items-v1";
  const fingerprint = main.prepare("SELECT value FROM migration_meta WHERE key=?").get(key)?.value;
  if (
    !fingerprint ||
    index.prepare("SELECT value FROM index_meta WHERE key=?").get(key)?.value === fingerprint
  )
    return;
  const ids: number[] = JSON.parse(fingerprint);
  index.exec("BEGIN IMMEDIATE");
  try {
    for (const id of ids) {
      if (main.prepare("SELECT 1 FROM project_item WHERE id=?").get(id)) continue;
      for (const table of ["content_fts", "vec_documents"]) {
        if (columns(index, table).has("prefixed_id")) {
          index.prepare(`DELETE FROM ${table} WHERE prefixed_id=?`).run(`project-item:${id}`);
        }
      }
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
