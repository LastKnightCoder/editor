import Database from "better-sqlite3";
import log from "electron-log";
import ContentTable from "./content";

const GOAL_TABLES = [
  "goals",
  "goal_items",
  "goal_progress_entries",
  "goal_note_link",
  "goal_progress_note_link",
] as const;

const GOAL_OPERATION_TYPES = [
  "goal",
  "goal_item",
  "goal_progress_entry",
  "goal_note_link",
  "goal_progress_note_link",
] as const;

export default class GoalHardCleanupTable {
  static getListenEvents() {
    return {};
  }

  static upgradeTable(db: Database.Database): void {
    try {
      const existingTables = GOAL_TABLES.filter((tableName) =>
        this.tableExists(db, tableName),
      );
      if (existingTables.length === 0) {
        this.cleanupOperations(db);
        return;
      }

      const linkedContentIds = this.collectLinkedContentIds(db);
      let detachedLinkCount = 0;
      for (const contentId of linkedContentIds) {
        try {
          ContentTable.deleteContent(db, contentId);
          detachedLinkCount += 1;
        } catch (error) {
          log.error(
            `[GoalHardCleanup] Failed to cleanup content ref for content_id=${contentId}`,
            error,
          );
        }
      }

      this.cleanupOperations(db);

      for (const tableName of GOAL_TABLES.slice().reverse()) {
        db.exec(`DROP TABLE IF EXISTS ${tableName}`);
      }

      log.info(
        `[GoalHardCleanup] completed: dropped=${existingTables.join(",")}, contentRefs=${detachedLinkCount}`,
      );
    } catch (error) {
      log.error("[GoalHardCleanup] failed", error);
    }
  }

  private static collectLinkedContentIds(db: Database.Database): number[] {
    const ids: number[] = [];

    if (this.tableExists(db, "goal_note_link")) {
      const rows = db
        .prepare(
          "SELECT content_id FROM goal_note_link WHERE content_id IS NOT NULL",
        )
        .all() as Array<{ content_id: number }>;
      rows.forEach((row) => ids.push(row.content_id));
    }

    if (this.tableExists(db, "goal_progress_note_link")) {
      const rows = db
        .prepare(
          "SELECT content_id FROM goal_progress_note_link WHERE content_id IS NOT NULL",
        )
        .all() as Array<{ content_id: number }>;
      rows.forEach((row) => ids.push(row.content_id));
    }

    return ids;
  }

  private static cleanupOperations(db: Database.Database): void {
    if (!this.tableExists(db, "operation")) {
      return;
    }
    const placeholders = GOAL_OPERATION_TYPES.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM operation WHERE operation_content_type IN (${placeholders})`,
    ).run(...GOAL_OPERATION_TYPES);
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
