import Database from "better-sqlite3";
import { DataTable, CreateDataTable, UpdateDataTable } from "@/types";
import Operation from "./operation";
import DataTableViewTable from "./data-table-view";

export default class DataTableTable {
  static initTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS data_tables (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        columns TEXT NOT NULL,
        rows TEXT NOT NULL,
        active_view_id INTEGER,
        ref_count INTEGER DEFAULT 0
      )
    `);
  }

  static upgradeTable(db: Database.Database) {
    const tableInfo = db
      .prepare(`PRAGMA table_info(data_tables)`)
      .all() as Array<{ name: string }>;
    const hasColumnOrder = tableInfo.some(
      (column) => column.name === "column_order",
    );
    const hasActiveViewId = tableInfo.some(
      (column) => column.name === "active_view_id",
    );
    const hasRefCount = tableInfo.some((column) => column.name === "ref_count");

    if (!hasRefCount) {
      db.exec("ALTER TABLE data_tables ADD COLUMN ref_count INTEGER DEFAULT 1");
      db.exec(`UPDATE data_tables SET ref_count = 1 WHERE ref_count IS NULL`);
    }

    this.deleteDataTableWhenRefCountIsZero(db);

    if (!hasColumnOrder && hasActiveViewId) {
      return;
    }

    db.exec("BEGIN");
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS data_tables_new (
          id INTEGER PRIMARY KEY,
          create_time INTEGER NOT NULL,
          update_time INTEGER NOT NULL,
          columns TEXT NOT NULL,
          rows TEXT NOT NULL,
          active_view_id INTEGER,
          ref_count INTEGER NOT NULL
        )
      `);

      const selectStmt = db.prepare(`SELECT * FROM data_tables`);
      const insertStmt = db.prepare(`
        INSERT INTO data_tables_new (
          id,
          create_time,
          update_time,
          columns,
          rows,
          active_view_id,
          ref_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const rows = selectStmt.all();

      rows.forEach((row: any) => {
        const columns = JSON.parse(row.columns || "[]");
        const tableRows = JSON.parse(row.rows || "[]");
        const columnOrder = hasColumnOrder
          ? JSON.parse(row.column_order || "[]")
          : columns.map((c: { id: string }) => c.id);
        const rowOrder = tableRows.map((r: { id: string }) => r.id);

        const view = DataTableViewTable.create(db, {
          tableId: row.id,
          name: "默认视图",
          type: "table",
          order: 0,
          config: {
            columnOrder,
            rowOrder,
            filters: null,
            sorts: [],
            groupBy: null,
          },
        });

        insertStmt.run(
          row.id,
          row.create_time,
          row.update_time,
          row.columns,
          row.rows,
          view.id,
          row.ref_count ?? 1,
        );
      });

      db.exec("DROP TABLE data_tables");
      db.exec("ALTER TABLE data_tables_new RENAME TO data_tables");

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  static getListenEvents() {
    return {
      "data-table:create": this.create.bind(this),
      "data-table:update": this.update.bind(this),
      "data-table:get-by-id": this.getById.bind(this),
      "data-table:get-detail": this.getDetail.bind(this),
      "data-table:set-active-view": this.setActiveView.bind(this),
      "data-table:delete": this.remove.bind(this),
      "data-table:increment-ref-count": this.incrementRefCount.bind(this),
    } as const;
  }

  static parse(row: any): DataTable {
    return {
      id: row.id,
      createTime: row.create_time,
      updateTime: row.update_time,
      columns: JSON.parse(row.columns || "[]"),
      rows: JSON.parse(row.rows || "[]"),
      activeViewId: row.active_view_id ?? null,
      refCount: row.ref_count ?? 0,
    };
  }

  static getById(db: Database.Database, id: number): DataTable | null {
    const stmt = db.prepare(`SELECT * FROM data_tables WHERE id = ?`);
    const row = stmt.get(id);
    if (!row) return null;
    return this.parse(row);
  }

  static getDetail(
    db: Database.Database,
    id: number,
  ): {
    table: DataTable | null;
    views: ReturnType<typeof DataTableViewTable.listByTableId>;
  } {
    const table = this.getById(db, id);
    if (!table) {
      return { table: null, views: [] };
    }
    const views = DataTableViewTable.listByTableId(db, id);
    return { table, views };
  }

  static create(db: Database.Database, table: CreateDataTable): DataTable {
    const stmt = db.prepare(`
      INSERT INTO data_tables (create_time, update_time, columns, rows, active_view_id, ref_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const res = stmt.run(
      now,
      now,
      JSON.stringify(table.columns || []),
      JSON.stringify(table.rows || []),
      table.activeViewId ?? null,
      1,
    );
    const id = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "data-table", "insert", id, now);

    const view = DataTableViewTable.createDefaultView(
      db,
      id,
      table.columns || [],
      table.rows || [],
    );

    const updateActiveViewStmt = db.prepare(
      `UPDATE data_tables SET active_view_id = ? WHERE id = ?`,
    );
    updateActiveViewStmt.run(view.id, id);

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
        active_view_id = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      now,
      JSON.stringify(table.columns || []),
      JSON.stringify(table.rows || []),
      table.activeViewId ?? null,
      table.id,
    );
    Operation.insertOperation(db, "data-table", "update", table.id, now);

    DataTableViewTable.syncViewsWithTable(
      db,
      table.id,
      table.columns || [],
      table.rows || [],
    );

    return this.getById(db, table.id);
  }

  static remove(db: Database.Database, id: number): number {
    const stmt = db.prepare(`
      UPDATE data_tables SET ref_count = ref_count - 1 WHERE id = ?
    `);
    const changes = stmt.run(id).changes;

    Operation.insertOperation(db, "data-table", "delete", id, Date.now());

    // this.deleteDataTableWhenRefCountIsZero(db);

    return changes;
  }

  static incrementRefCount(db: Database.Database, id: number): number {
    const stmt = db.prepare(`
      UPDATE data_tables SET ref_count = ref_count + 1 WHERE id = ?
    `);
    const changes = stmt.run(id).changes;

    if (changes > 0) {
      const updateTimeStmt = db.prepare(
        `UPDATE data_tables SET update_time = ? WHERE id = ?`,
      );
      updateTimeStmt.run(Date.now(), id);
    }

    return changes;
  }

  static deleteDataTableWhenRefCountIsZero(db: Database.Database) {
    const selectStmt = db.prepare(
      `SELECT id FROM data_tables WHERE ref_count <= 0`,
    );
    const ids = selectStmt.all() as Array<{ id: number }>;
    if (!ids.length) return;

    const deleteViewsStmt = db.prepare(
      `DELETE FROM data_table_views WHERE table_id = ?`,
    );
    const deleteTableStmt = db.prepare(`DELETE FROM data_tables WHERE id = ?`);

    const now = Date.now();
    ids.forEach(({ id }) => {
      deleteViewsStmt.run(id);
      deleteTableStmt.run(id);
      Operation.insertOperation(db, "data-table", "delete", id, now);
    });
  }

  static setActiveView(
    db: Database.Database,
    payload: { tableId: number; viewId: number | null },
  ): DataTable | null {
    const stmt = db.prepare(
      `UPDATE data_tables SET active_view_id = ?, update_time = ? WHERE id = ?`,
    );
    const now = Date.now();
    stmt.run(payload.viewId ?? null, now, payload.tableId);
    Operation.insertOperation(db, "data-table", "update", payload.tableId, now);
    return this.getById(db, payload.tableId);
  }
}
