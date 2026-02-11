import Database from "better-sqlite3";
import log from "electron-log";
import ContentTable from "./content";

const SLIDE_TABLES = [
  "slide_assets",
  "slide_pages",
  "slide_decks",
  "slide_group",
] as const;

const SLIDE_OPERATION_TYPES = ["slide-deck", "slide-page"] as const;

export default class SlideHardCleanupTable {
  static initTable(_db: Database.Database): void {
    // no-op：该模块仅在升级阶段执行一次性清理
  }

  static getListenEvents() {
    return {};
  }

  static upgradeTable(db: Database.Database): void {
    try {
      const existingTables = SLIDE_TABLES.filter((tableName) =>
        this.tableExists(db, tableName),
      );

      const contentIds = this.collectLinkedContentIds(db);
      let cleanedContentRefs = 0;
      for (const contentId of contentIds) {
        try {
          ContentTable.deleteContent(db, contentId);
          cleanedContentRefs += 1;
        } catch (error) {
          log.error(
            `[SlideHardCleanup] 清理内容引用失败 content_id=${contentId}`,
            error,
          );
        }
      }

      this.cleanupOperations(db);

      for (const tableName of SLIDE_TABLES) {
        db.exec(`DROP TABLE IF EXISTS ${tableName}`);
      }

      if (existingTables.length > 0 || cleanedContentRefs > 0) {
        log.info(
          `[SlideHardCleanup] 清理完成 dropped=${existingTables.join(",")}, contentRefs=${cleanedContentRefs}`,
        );
      }
    } catch (error) {
      log.error("[SlideHardCleanup] 清理失败", error);
    }
  }

  private static collectLinkedContentIds(db: Database.Database): number[] {
    if (!this.tableExists(db, "slide_pages")) {
      return [];
    }

    const columns = db
      .prepare("PRAGMA table_info(slide_pages)")
      .all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((item) => item.name));
    const selectColumns: string[] = [];

    if (columnNames.has("content_id")) {
      selectColumns.push("content_id");
    }
    if (columnNames.has("speaker_notes_content_id")) {
      selectColumns.push("speaker_notes_content_id");
    }
    if (selectColumns.length === 0) {
      return [];
    }

    const rows = db
      .prepare(`SELECT ${selectColumns.join(",")} FROM slide_pages`)
      .all() as Array<Record<string, number | null>>;

    const idSet = new Set<number>();
    for (const row of rows) {
      for (const column of selectColumns) {
        const value = row[column];
        if (typeof value === "number" && Number.isInteger(value)) {
          idSet.add(value);
        }
      }
    }

    return Array.from(idSet);
  }

  private static cleanupOperations(db: Database.Database): void {
    if (!this.tableExists(db, "operation")) {
      return;
    }

    const placeholders = SLIDE_OPERATION_TYPES.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM operation WHERE operation_content_type IN (${placeholders})`,
    ).run(...SLIDE_OPERATION_TYPES);
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
