import { randomUUID } from "node:crypto";
import type { MigrationDatabase } from "./knowledge-migration";
import { hasRetiredAudioItems, retireAudioNotes } from "./audio-note-retirement";

/**
 * 已下线功能留在老库里的表与列（功能下线时只删了建表语句，老库里的一直没删）：
 * history（浏览历史）、prompt（提示词库）、skill（数据库版 Skill，现存文件）、notion_sync（Notion 同步），
 * 音频笔记表与项目节点，以及 vibe_learning_resources 上不再使用的分章节字段。
 */
const RETIRED_TABLES = [
  "history",
  "prompt",
  "skill",
  "notion_sync",
  "audio_note_item",
  "audio_notes",
];
const RETIRED_COLUMNS: Array<[table: string, column: string]> = [
  ["vibe_learning_resources", "is_chunked"],
  ["vibe_learning_resources", "chapter_count"],
];

const tableExists = (db: MigrationDatabase, name: string) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));

const columnExists = (db: MigrationDatabase, table: string, column: string) =>
  db
    .prepare(`PRAGMA table_info("${table}")`)
    .all()
    .some(row => row.name === column);

/**
 * 删掉下线功能的残留表与列。先 VACUUM INTO 备份（prompt / notion_sync 里可能还有数据）；
 * 幂等：没有可删的就什么都不做、不备份。桌面开库、同步下载校验、CLI 共用。
 */
export function retireFeatureTables(db: MigrationDatabase, databasePath: string): string[] {
  const tables = RETIRED_TABLES.filter(name => tableExists(db, name));
  const columns = RETIRED_COLUMNS.filter(
    ([table, column]) => tableExists(db, table) && columnExists(db, table, column)
  );
  const audioItems = hasRetiredAudioItems(db);
  if (tables.length === 0 && columns.length === 0 && !audioItems) return [];

  try {
    if (databasePath !== ":memory:") {
      db.prepare("VACUUM INTO ?").run(
        `${databasePath}.pre-feature-table-retirement-v1-${randomUUID()}.bak`
      );
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      if (audioItems || tables.some(name => name === "audio_notes" || name === "audio_note_item")) {
        retireAudioNotes(db);
      }
      // 表上的索引随表一起删；这几列上没有索引，可以直接 DROP COLUMN
      for (const name of tables) db.exec(`DROP TABLE IF EXISTS "${name}"`);
      for (const [table, column] of columns) {
        db.exec(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    throw new Error(
      `FEATURE_TABLE_RETIREMENT_FAILED: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return [
    ...tables,
    ...columns.map(([table, column]) => `${table}.${column}`),
    ...(audioItems ? ["project_item.audio-note"] : []),
  ];
}
