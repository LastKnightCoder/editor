import type Database from "better-sqlite3";
import UPGRADE_SQL from "@tau/db-schema/schema/upgrades/excerpt-provider.sql?raw";

const EXCERPT_COLUMNS = [
  ["location", "TEXT NOT NULL DEFAULT ''"],
  ["url", "TEXT"],
] as const;

/** 开库为存量摘录补列、位置、外链与提供方名称；已完成时不改动任何行。全部设备升级后删除。 */
export function upgradeExcerptProviders(db: Database.Database): boolean {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(excerpt)").all() as { name: string }[]).map(row => row.name)
  );
  const done =
    EXCERPT_COLUMNS.every(([name]) => columns.has(name)) &&
    db.prepare("SELECT 1 FROM excerpt_provider WHERE source_type = 'web'").get() !== undefined;
  if (done) return false;
  db.transaction(() => {
    for (const [name, definition] of EXCERPT_COLUMNS) {
      if (!columns.has(name)) db.exec(`ALTER TABLE excerpt ADD COLUMN ${name} ${definition}`);
    }
    db.exec(UPGRADE_SQL);
  })();
  return true;
}
