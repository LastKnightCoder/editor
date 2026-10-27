import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import MAIN_SCHEMA_SQL from "@tau/db-schema/schema/main.sql?raw";
import MAIN_SCHEMA_VERSION from "@tau/db-schema/schema/main-version.json";

const schemaHash = createHash("sha1").update(MAIN_SCHEMA_SQL).digest("hex");

/** 版本标记仅记录初始化结果，不作为开库门禁；结构与标记同事务提交。 */
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
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  if (
    meta.main_schema_hash === schemaHash &&
    meta.main_schema_version === String(MAIN_SCHEMA_VERSION)
  )
    return;
  db.transaction(() => {
    db.exec(MAIN_SCHEMA_SQL);
    const write = db.prepare(
      "INSERT INTO schema_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    );
    const now = Date.now();
    write.run("main_schema_version", String(MAIN_SCHEMA_VERSION), now);
    write.run("main_schema_hash", schemaHash, now);
  })();
}
