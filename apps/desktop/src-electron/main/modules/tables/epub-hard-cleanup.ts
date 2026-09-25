import Database from "better-sqlite3";
import log from "electron-log";

const EPUB_TABLES = ["epub_bookmarks", "epub_annotations", "epubs"] as const;

const EPUB_OPERATION_TYPES = ["epub", "epub-annotation", "epub-bookmark"] as const;

export default class EpubHardCleanupTable {
  static getListenEvents() {
    return {};
  }

  static upgradeTable(db: Database.Database): void {
    const existingTables = EPUB_TABLES.filter(tableName => this.tableExists(db, tableName));

    try {
      db.transaction(() => {
        // 三张表已删除后仍执行 project_item/operation 清理，兜底旧备份恢复等回流数据
        this.cleanupProjectItemRefs(db);
        this.cleanupOperations(db);

        for (const tableName of EPUB_TABLES) {
          db.exec(`DROP TABLE IF EXISTS ${tableName}`);
        }
      })();

      if (existingTables.length > 0) {
        log.info(`[EpubHardCleanup] 清理完成 dropped=${existingTables.join(",")}`);
      }
    } catch (error) {
      log.error("[EpubHardCleanup] 清理失败", error);
    }
  }

  private static cleanupProjectItemRefs(db: Database.Database): void {
    if (!this.tableExists(db, "project_item")) {
      return;
    }
    db.prepare("DELETE FROM project_item WHERE ref_type = 'epub'").run();
  }

  private static cleanupOperations(db: Database.Database): void {
    if (!this.tableExists(db, "operation")) {
      return;
    }

    const placeholders = EPUB_OPERATION_TYPES.map(() => "?").join(",");
    db.prepare(`DELETE FROM operation WHERE operation_content_type IN (${placeholders})`).run(
      ...EPUB_OPERATION_TYPES
    );
  }

  private static tableExists(db: Database.Database, tableName: string): boolean {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName) as { name: string } | undefined;
    return Boolean(row?.name);
  }
}
