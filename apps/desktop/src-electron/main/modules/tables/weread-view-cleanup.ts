import Database from "better-sqlite3";
import log from "electron-log";

/** weread_view 表与其配置键随旧表格视图页退役（D-059 / P-weread），开库幂等清理 */

const WEREAD_VIEW_CONFIG_KEYS = ["active_view_id", "column_widths", "row_order"] as const;

export default class WereadViewCleanupTable {
  static getListenEvents() {
    return {};
  }

  static upgradeTable(db: Database.Database): void {
    const tableExists = this.checkTableExists(db, "weread_view");

    try {
      db.transaction(() => {
        if (this.checkTableExists(db, "weread_config")) {
          const placeholders = WEREAD_VIEW_CONFIG_KEYS.map(() => "?").join(",");
          db.prepare(`DELETE FROM weread_config WHERE key IN (${placeholders})`).run(
            ...WEREAD_VIEW_CONFIG_KEYS
          );
        }
        db.exec(`DROP TABLE IF EXISTS weread_view`);
      })();

      if (tableExists) {
        log.info("[WereadViewCleanup] weread_view 表与视图配置键清理完成");
      }
    } catch (error) {
      log.error("[WereadViewCleanup] 清理失败", error);
    }
  }

  private static checkTableExists(db: Database.Database, tableName: string): boolean {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(tableName) as { name: string } | undefined;
    return row !== undefined;
  }
}
