import { needsReceiptUpgrade, upgradeCreateReceipts } from "./main-plugin-receipts";
import DocumentTaskIdentitiesTable from "./tables/document-task-identities";
import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import MAIN_SCHEMA_SQL from "@tau/db-schema/schema/main.sql?raw";
import MAIN_SCHEMA_VERSION from "@tau/db-schema/schema/main-version.json";
import { migrateRowIds, rowIdTables, seedRowIdSequences } from "./main-row-ids";
import { FEATURE_ONBOARDING_KEY } from "./tables/workspace-preferences";
import { needsQueryDatabaseUpgrade, upgradeQueryDatabases } from "./main-query-databases";

const schemaHash = createHash("sha1").update(MAIN_SCHEMA_SQL).digest("hex");
const independentRowIdTables = rowIdTables(MAIN_SCHEMA_SQL);

/** 版本标记仅记录初始化结果，不作为开库门禁；结构与标记同事务提交。
 *  空库（没有任何表）是新建的工作区，在同一事务里标记等待首次启动选用途。 */
export function ensureMainSchema(db: Database.Database): void {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  const meta = tables.some(table => table.name === "schema_meta")
    ? Object.fromEntries(
        (
          db.prepare("SELECT key, value FROM schema_meta").all() as { key: string; value: string }[]
        ).map(({ key, value }) => [key, value])
      )
    : {};
  const projectionMissing = [
    "document_task_identities",
    "document_task_projection_state",
    "document_task_projection_errors",
  ].some(name => !tables.some(table => table.name === name));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const receiptUpgrade = needsReceiptUpgrade(db);
  const queryDatabaseUpgrade = needsQueryDatabaseUpgrade(db);
  const hashChanged = meta.main_schema_hash !== schemaHash;
  const versionChanged = meta.main_schema_version !== String(MAIN_SCHEMA_VERSION);
  if (
    !projectionMissing &&
    !receiptUpgrade &&
    !queryDatabaseUpgrade &&
    !hashChanged &&
    !versionChanged
  ) {
    while (!DocumentTaskIdentitiesTable.prepare(db)) {
      /* 每批独立提交，允许中断后续建。 */
    }
    return;
  }
  // 升级期间资料库不可用；每次启动都触发升级说明标记没有落住，靠 reasons 定位
  const upgradeStartAt = Date.now();
  const reasons = [
    projectionMissing && "projection",
    receiptUpgrade && "receipts",
    queryDatabaseUpgrade && "query-databases",
    hashChanged && "schema-hash",
    versionChanged && "version",
  ].filter(Boolean);
  const foreignKeyErrors = () => db.pragma("foreign_key_check") as Record<string, unknown>[];
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      const foreignKeys = new Set(foreignKeyErrors().map(row => JSON.stringify(row)));
      migrateRowIds(db, independentRowIdTables);
      upgradeCreateReceipts(db, MAIN_SCHEMA_SQL);
      if (tables.some(table => table.name === "calendar_event")) {
        const columns = db.pragma("table_info(calendar_event)") as { name: string }[];
        for (const [name, type] of [
          ["start_utc_ms", "INTEGER"],
          ["end_utc_ms", "INTEGER"],
          ["start_time_zone", "TEXT"],
          ["end_time_zone", "TEXT"],
        ]) {
          if (!columns.some(column => column.name === name))
            db.exec(`ALTER TABLE calendar_event ADD COLUMN ${name} ${type}`);
        }
      }
      if (tables.some(table => table.name === "todo_item")) {
        const columns = db.pragma("table_info(todo_item)") as { name: string }[];
        for (const [name, definition] of [
          [
            "priority",
            "TEXT NOT NULL DEFAULT 'none' CHECK(priority IN ('none','low','medium','high'))",
          ],
          ["tags", "TEXT NOT NULL DEFAULT '[]'"],
        ]) {
          if (!columns.some(column => column.name === name))
            db.exec(`ALTER TABLE todo_item ADD COLUMN ${name} ${definition}`);
        }
      }
      const logExists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_change_log'")
        .get();
      if (
        logExists &&
        !(db.pragma("table_info(data_change_log)") as { name: string }[]).some(
          column => column.name === "action"
        )
      )
        db.exec(
          "ALTER TABLE data_change_log ADD COLUMN action TEXT CHECK(action IN ('created','updated','deleted'))"
        );
      for (const trigger of [
        "calendar_time_legacy_edit",
        "calendar_time_reader_version",
        "calendar_time_first_insert",
        "calendar_time_first_update",
        "dc_todo_item_insert",
        "dc_todo_item_update",
        "dc_todo_item_meta_update",
        "dc_calendar_event_insert",
        "dc_calendar_event_update",
        "dc_todo_group_insert",
        "dc_todo_group_update",
        "dc_calendar_insert",
        "dc_calendar_update",
        "dc_document_task_identity_insert",
        "dc_content_documents_insert",
        "dc_content_documents_update",
        "dc_content_documents_delete",
        "dc_contents_update",
        "dc_contents_delete",
        "dc_content_document_blocks_insert",
        "dc_content_document_blocks_update",
        "dc_content_document_blocks_delete",
      ])
        db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      db.exec(MAIN_SCHEMA_SQL);
      upgradeQueryDatabases(db);
      if (projectionMissing)
        db.prepare(
          "UPDATE document_task_projection_state SET ready=0,after_content_id=0,epoch=lower(hex(randomblob(16))) WHERE id='main'"
        ).run();
      seedRowIdSequences(db, independentRowIdTables);
      if (foreignKeyErrors().some(row => !foreignKeys.has(JSON.stringify(row))))
        throw new Error("主库编号升级引入了外键不一致");
      const write = db.prepare(
        "INSERT INTO schema_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      );
      const now = Date.now();
      write.run("main_schema_version", String(MAIN_SCHEMA_VERSION), now);
      write.run("main_schema_hash", schemaHash, now);
      if (tables.length === 0)
        db.prepare(
          "INSERT OR IGNORE INTO workspace_preferences (key, value, update_time) VALUES (?, ?, ?)"
        ).run(FEATURE_ONBOARDING_KEY, "pending", now);
    }).immediate();
  } finally {
    db.pragma("foreign_keys = ON");
  }
  console.info(
    `[database] 主库结构升级完成: fromVersion=${meta.main_schema_version ?? "none"}, fromHash=${String(meta.main_schema_hash ?? "none").slice(0, 8)}, toVersion=${MAIN_SCHEMA_VERSION}, reasons=${reasons.join(",")}, elapsedMs=${Date.now() - upgradeStartAt}`
  );
  while (!DocumentTaskIdentitiesTable.prepare(db)) {
    /* 每批独立提交，允许中断后续建。 */
  }
}
