import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import MAIN_SCHEMA_SQL from "@tau/db-schema/schema/main.sql?raw";
import MAIN_SCHEMA_VERSION from "@tau/db-schema/schema/main-version.json";

const schemaHash = createHash("sha1").update(MAIN_SCHEMA_SQL).digest("hex");

export function removeRetiredDatabaseState(directory: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.db$/i.test(entry.name)) continue;
    const db = new Database(join(directory, entry.name), { fileMustExist: true });
    try {
      removeRetiredTables(db);
    } finally {
      db.close();
    }
  }
  rmSync(join(directory, "device-sync"), { recursive: true, force: true });
}

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
  ) {
    removeRetiredTables(db);
    return;
  }
  db.transaction(() => {
    db.exec(MAIN_SCHEMA_SQL);
    const write = db.prepare(
      "INSERT INTO schema_meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    );
    const now = Date.now();
    write.run("main_schema_version", String(MAIN_SCHEMA_VERSION), now);
    write.run("main_schema_hash", schemaHash, now);
  })();
  removeRetiredTables(db);
}

function removeRetiredTables(db: Database.Database): void {
  const objects = db
    .prepare(
      "SELECT type, name FROM sqlite_master WHERE name GLOB '_tau_device_*' AND type IN ('trigger', 'table') ORDER BY type DESC"
    )
    .all() as { type: "trigger" | "table"; name: string }[];
  if (!objects.length) return;
  const secureDelete = db.pragma("secure_delete", { simple: true });
  db.pragma("secure_delete = ON");
  try {
    db.transaction(() => {
      for (const { type, name } of objects)
        db.exec(`DROP ${type === "trigger" ? "TRIGGER" : "TABLE"} "${name.replaceAll('"', '""')}"`);
    })();
  } finally {
    db.pragma(`secure_delete = ${Number(secureDelete)}`);
  }
}
