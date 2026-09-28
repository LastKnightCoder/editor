import Database from "better-sqlite3";

/**
 * 项目 / 数据库 / Vibe Learning 三个模块共用的 id 序列。
 *
 * 三者原本都是 project 表的一行，拆分后 id 必须保持全局唯一且永不复用：
 * VL 的磁盘索引库（`{mainDb}-project-{id}.db`）、markdown 目录、
 * chat_session.domain_id、vl_note.project_id、operation、publish_selections
 * 都以这个 id 命名，复用会指向别人的数据。
 */
const ENTITY_ID_SEQ_KEY = "project:id-seq";

const SEQ_TABLES = ["project", "database_item", "vibe_learning_project"] as const;

export function ensureMigrationMetaTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

export function isMigrationDone(db: Database.Database, key: string) {
  ensureMigrationMetaTable(db);
  const row = db.prepare(`SELECT value FROM migration_meta WHERE key = ?`).get(key) as
    { value: string } | undefined;
  return row?.value === "done";
}

export function markMigrationDone(db: Database.Database, key: string) {
  ensureMigrationMetaTable(db);
  db.prepare(
    `
      INSERT INTO migration_meta (key, value)
      VALUES (?, 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'
    `
  ).run(key);
}

function tableExists(db: Database.Database, table: string) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

/**
 * 取下一个实体 id：序列值与三张表的实际 MAX(id) 取最大后 +1，然后写回序列。
 */
export function getNextModuleEntityId(db: Database.Database): number {
  ensureMigrationMetaTable(db);
  const seqRow = db
    .prepare(`SELECT value FROM migration_meta WHERE key = ?`)
    .get(ENTITY_ID_SEQ_KEY) as { value: string } | undefined;
  const parsedSeq = Number.parseInt(seqRow?.value || "0", 10);
  let nextId = Number.isFinite(parsedSeq) ? parsedSeq : 0;

  for (const table of SEQ_TABLES) {
    if (!tableExists(db, table)) continue;
    const maxIdRow = db.prepare(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${table}`).get() as
      { max_id: number } | undefined;
    nextId = Math.max(nextId, Number(maxIdRow?.max_id || 0));
  }

  nextId += 1;

  db.prepare(
    `
      INSERT INTO migration_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `
  ).run(ENTITY_ID_SEQ_KEY, String(nextId));

  return nextId;
}
