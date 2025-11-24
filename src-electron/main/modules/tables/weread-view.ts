import { Database } from "better-sqlite3";
import { Table } from "../../types/table";
import type { DataTableView } from "@/types";

class WeReadViewTable implements Table {
  initTable(db: Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS weread_view (
        id INTEGER PRIMARY KEY,
        table_id INTEGER DEFAULT 0,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        view_order INTEGER DEFAULT 0,
        config TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_weread_view_order ON weread_view(view_order);
    `);
  }

  upgradeTable(_db: Database): void {
    // 未来版本升级时使用
  }

  getListenEvents(): Record<string, (db: Database, ...args: any) => any> {
    return {};
  }

  save(db: Database, view: DataTableView): DataTableView {
    const stmt = db.prepare(`
      INSERT INTO weread_view (
        id, table_id, name, type, view_order, config, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        view_order = excluded.view_order,
        config = excluded.config,
        updated_at = excluded.updated_at
    `);

    const now = Date.now();
    stmt.run(
      view.id,
      view.tableId || 0,
      view.name,
      view.type,
      view.order || 0,
      JSON.stringify(view.config),
      view.createTime || now,
      now,
    );

    return view;
  }

  getAll(db: Database): DataTableView[] {
    const stmt = db.prepare(`
      SELECT * FROM weread_view ORDER BY view_order ASC
    `);
    const rows = stmt.all() as any[];
    return rows.map((row) => this.rowToView(row));
  }

  delete(db: Database, viewId: number): void {
    const stmt = db.prepare(`
      DELETE FROM weread_view WHERE id = ?
    `);
    stmt.run(viewId);
  }

  private rowToView(row: any): DataTableView {
    return {
      id: row.id,
      tableId: row.table_id,
      name: row.name,
      type: row.type,
      order: row.view_order,
      config: JSON.parse(row.config),
      createTime: row.created_at,
      updateTime: row.updated_at,
    };
  }
}

export default new WeReadViewTable();
