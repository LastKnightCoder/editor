import { randomUUID } from "node:crypto";
import type { MigrationDatabase } from "./knowledge-migration";

const RETIRED_TABLES = ["read_later", "rss_entry", "rss_subscription", "rss_feed"];

/** 每次遇到旧表都先保全当前快照，避免恢复旧库后复用不匹配的历史备份。 */
export function retireSubscriptions(db: MigrationDatabase, databasePath: string): void {
  if (
    !RETIRED_TABLES.some(name =>
      db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
    )
  )
    return;

  try {
    if (databasePath !== ":memory:") {
      db.prepare("VACUUM INTO ?").run(
        `${databasePath}.pre-subscription-retirement-v1-${randomUUID()}.bak`
      );
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const name of RETIRED_TABLES) db.exec(`DROP TABLE IF EXISTS ${name}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    throw new Error(
      `SUBSCRIPTION_RETIREMENT_FAILED: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
