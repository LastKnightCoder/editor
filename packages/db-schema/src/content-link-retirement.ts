import { randomUUID } from "node:crypto";
import type { MigrationDatabase } from "./knowledge-migration";
import retirementSql from "./content-link-retirement-sql.json";

/** content_link 能迁入谱系的唯一一种记录：网页条目 → 它的剪藏解析文档 */
const MIGRATABLE = "source_type = 'project_item' AND target_type = 'web_clip'";

const hasContentLink = (db: MigrationDatabase) =>
  Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='content_link'").get()
  );

const count = (db: MigrationDatabase, where: string) =>
  Number(db.prepare(`SELECT COUNT(*) AS count FROM content_link WHERE ${where}`).get()?.count ?? 0);

/**
 * content_link 迁入 entity_lineage（relation = clipped_from）后删表，返回迁移条数。
 * 存在无法迁移的记录时失败不放行（D-091）；幂等：表已删除时什么都不做、不备份。
 * 迁移 SQL 与移动端共用；自带 entity_lineage 建表，CLI 不先执行主库 schema 也能用。
 */
export function retireContentLink(db: MigrationDatabase, databasePath: string): number {
  if (!hasContentLink(db)) return 0;
  try {
    const unexpected = count(db, `NOT (${MIGRATABLE})`);
    if (unexpected > 0) throw new Error(`content_link 含 ${unexpected} 条无法迁移的记录`);
    const migrated = count(db, MIGRATABLE);
    if (databasePath !== ":memory:") {
      db.prepare("VACUUM INTO ?").run(
        `${databasePath}.pre-content-link-retirement-v1-${randomUUID()}.bak`
      );
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec((retirementSql as string[]).join("\n"));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return migrated;
  } catch (error) {
    throw new Error(
      `CONTENT_LINK_RETIREMENT_FAILED: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
