import type Database from "better-sqlite3";

/** 仅清理主库的废弃索引；实际文件和协作缓存库不在此迁移范围。 */
export default class ResourceHardCleanupTable {
  static getListenEvents() {
    return {};
  }

  static upgradeTable(db: Database.Database): void {
    db.transaction(() => {
      const operationTable = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'operation'")
        .get();
      if (operationTable) {
        db.prepare("DELETE FROM operation WHERE operation_content_type = ?").run("resource");
      }
      db.exec(`
        DROP TABLE IF EXISTS resources;
        DROP TABLE IF EXISTS resource_scan_version;
        DROP TABLE IF EXISTS resource_group;
      `);
    })();
  }
}
