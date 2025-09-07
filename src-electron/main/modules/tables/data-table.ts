import Database from "better-sqlite3";
import { DataTable, CreateDataTable, UpdateDataTable } from "@/types";
import Operation from "./operation";

export default class DataTableTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS data_tables (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        columns TEXT NOT NULL,
        rows TEXT NOT NULL,
        column_order TEXT NOT NULL
      )
    `);
  }

  static upgradeTable(_db: Database.Database) {
    // no-op
  }

  static getListenEvents() {
    return {
      "data-table:create": this.create.bind(this),
      "data-table:update": this.update.bind(this),
      "data-table:get-by-id": this.getById.bind(this),
      "data-table:delete": this.remove.bind(this),
    } as const;
  }

  static parse(row: any): DataTable {
    return {
      id: row.id,
      createTime: row.create_time,
      updateTime: row.update_time,
      columns: JSON.parse(row.columns || "[]"),
      rows: JSON.parse(row.rows || "[]"),
      columnOrder: JSON.parse(row.column_order || "[]"),
    };
  }

  static getById(db: Database.Database, id: number): DataTable | null {
    const stmt = db.prepare(`SELECT * FROM data_tables WHERE id = ?`);
    const row = stmt.get(id);
    if (!row) return null;
    return this.parse(row);
  }

  static create(db: Database.Database, table: CreateDataTable): DataTable {
    const stmt = db.prepare(`
      INSERT INTO data_tables (create_time, update_time, columns, rows, column_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify(table.columns || []),
      JSON.stringify(table.rows || []),
      JSON.stringify(
        table.columnOrder || (table.columns || []).map((c) => c.id),
      ),
    );
    const id = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "data-table", "insert", id, now);
    return this.getById(db, id)!;
  }

  static update(
    db: Database.Database,
    table: UpdateDataTable,
  ): DataTable | null {
    const stmt = db.prepare(`
      UPDATE data_tables SET
        update_time = ?,
        columns = ?,
        rows = ?,
        column_order = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      JSON.stringify(table.columns || []),
      JSON.stringify(table.rows || []),
      JSON.stringify(table.columnOrder || []),
      table.id,
    );
    Operation.insertOperation(db, "data-table", "update", table.id, now);
    return this.getById(db, table.id);
  }

  static remove(db: Database.Database, id: number): number {
    const stmt = db.prepare(`DELETE FROM data_tables WHERE id = ?`);
    Operation.insertOperation(db, "data-table", "delete", id, Date.now());
    return stmt.run(id).changes;
  }
}
