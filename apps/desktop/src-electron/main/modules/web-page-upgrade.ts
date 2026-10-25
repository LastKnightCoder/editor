import type Database from "better-sqlite3";
import WebPageTable from "./tables/web-page";

/** 开库为存量网页摘录补 web_page 页面行（伴读库的页面索引）；已完成时不改动任何行。全部设备升级后删除。 */
export function upgradeWebPages(db: Database.Database): number {
  return WebPageTable.backfill(db);
}
