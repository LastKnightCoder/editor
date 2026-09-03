import Database from "better-sqlite3";
import log from "electron-log";
import ContentTable from "./content";

const BADGE_TABLES = [
  "badge_manual_entry",
  "badge_award",
  "badge_progress",
  "badge_event",
  "badge_milestone",
  "badge_definition",
] as const;

export default class BadgeHardCleanupTable {
  static getListenEvents() {
    return {};
  }

  static upgradeTable(db: Database.Database): void {
    const existingTables = BADGE_TABLES.filter((tableName) =>
      this.tableExists(db, tableName),
    );
    if (existingTables.length === 0) {
      return;
    }

    try {
      const result = db.transaction(() => {
        const deletedContentIds: number[] = [];
        for (const contentId of this.collectDetailContentIds(db)) {
          if (ContentTable.deleteContent(db, contentId) > 0) {
            deletedContentIds.push(contentId);
          }
        }

        this.cleanupDeletedContentOperations(db, deletedContentIds);
        for (const tableName of BADGE_TABLES) {
          db.exec(`DROP TABLE IF EXISTS ${tableName}`);
        }

        return deletedContentIds.length;
      })();

      log.info(
        `[BadgeHardCleanup] completed: dropped=${existingTables.join(",")}, contentRefs=${result}`,
      );
    } catch (error) {
      log.error("[BadgeHardCleanup] failed", error);
    }
  }

  private static collectDetailContentIds(db: Database.Database): number[] {
    if (!this.tableExists(db, "badge_manual_entry")) {
      return [];
    }

    const rows = db
      .prepare(
        "SELECT detail_content_id FROM badge_manual_entry WHERE detail_content_id IS NOT NULL",
      )
      .all() as Array<{ detail_content_id: number }>;

    return Array.from(
      new Set(
        rows
          .map((row) => row.detail_content_id)
          .filter((contentId) => Number.isInteger(contentId)),
      ),
    );
  }

  private static cleanupDeletedContentOperations(
    db: Database.Database,
    contentIds: number[],
  ): void {
    if (contentIds.length === 0 || !this.tableExists(db, "operation")) {
      return;
    }

    const placeholders = contentIds.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM operation
       WHERE operation_content_type = 'content'
         AND operation_id IN (${placeholders})`,
    ).run(...contentIds);
  }

  private static tableExists(
    db: Database.Database,
    tableName: string,
  ): boolean {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(tableName) as { name: string } | undefined;
    return Boolean(row?.name);
  }
}
