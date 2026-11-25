import type Database from "better-sqlite3";

export function needsReceiptUpgrade(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='plugin_create_receipts'")
    .get() as { sql: string } | undefined;
  return !!row && !row.sql.includes("'todo-list'");
}

/** 约束由当前 schema 提取，升级保留已退役回执，防止重试复活。 */
export function upgradeCreateReceipts(db: Database.Database, schema: string): void {
  if (!needsReceiptUpgrade(db)) return;
  const create =
    /CREATE TABLE IF NOT EXISTS plugin_create_receipts \([\s\S]*?\) WITHOUT ROWID;/.exec(
      schema
    )?.[0];
  if (!create) throw new Error("创建回执 schema 缺失");
  db.exec(create.replace("plugin_create_receipts", "plugin_create_receipts_upgrade"));
  db.exec("INSERT INTO plugin_create_receipts_upgrade SELECT * FROM plugin_create_receipts");
  for (const trigger of [
    "trg_plugin_create_todo_delete",
    "trg_plugin_create_event_delete",
    "trg_plugin_create_todo_list_delete",
    "trg_plugin_create_calendar_delete",
  ])
    db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
  db.exec(
    "DROP TABLE plugin_create_receipts; ALTER TABLE plugin_create_receipts_upgrade RENAME TO plugin_create_receipts"
  );
}
