import Database from "better-sqlite3";
import type { HomeLayoutEntry } from "@/types/home-layout";

const MAX_ENTRIES = 500;

/** 首页面板布局：整份读、整份写，数组顺序即显示顺序 */
export default class HomeLayoutTable {
  static getListenEvents() {
    return {
      "home-layout:get": this.get.bind(this),
      "home-layout:save": this.save.bind(this),
    };
  }

  static get(db: Database.Database): HomeLayoutEntry[] {
    const rows = db
      .prepare("SELECT panel_id, hidden FROM home_panel_layout ORDER BY sort, panel_id")
      .all() as { panel_id: string; hidden: number }[];
    return rows.map(row => ({ id: row.panel_id, hidden: row.hidden === 1 }));
  }

  static save(db: Database.Database, entries: HomeLayoutEntry[]): HomeLayoutEntry[] {
    if (!Array.isArray(entries) || entries.length > MAX_ENTRIES)
      throw new Error(`首页布局最多 ${MAX_ENTRIES} 项`);
    const ids = new Set<string>();
    for (const entry of entries) {
      if (typeof entry?.id !== "string" || !entry.id || entry.id.length > 256)
        throw new Error("首页面板 ID 无效");
      if (ids.has(entry.id)) throw new Error(`首页面板重复：${entry.id}`);
      ids.add(entry.id);
    }
    const now = Date.now();
    db.prepare("DELETE FROM home_panel_layout").run();
    const insert = db.prepare(
      "INSERT INTO home_panel_layout (panel_id, sort, hidden, update_time) VALUES (?, ?, ?, ?)"
    );
    entries.forEach((entry, index) => insert.run(entry.id, index, entry.hidden ? 1 : 0, now));
    return this.get(db);
  }
}
