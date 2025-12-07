import Database from "better-sqlite3";
import { DataTable, CreateDataTable, UpdateDataTable } from "@/types";
import Operation from "./operation";
import DataTableViewTable from "./data-table-view";
import ContentTable from "./content";

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
    // 升级主列和 detailContentId
    this.upgradePrimaryColumn(db);

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

      rows.forEach((row: unknown) => {
        const rowData = row as Record<string, unknown>;
        const columns = JSON.parse((rowData.columns as string) || "[]");
        const tableRows = JSON.parse((rowData.rows as string) || "[]");
        const columnOrder = hasColumnOrder
          ? JSON.parse((rowData.column_order as string) || "[]")
          : columns.map((c: { id: string }) => c.id);
        const rowOrder = tableRows.map((r: { id: string }) => r.id);

        const view = DataTableViewTable.create(db, {
          tableId: rowData.id as number,
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
          rowData.id,
          rowData.create_time,
          rowData.update_time,
          rowData.columns,
          rowData.rows,
          view.id,
          (rowData.ref_count as number | undefined) ?? 1,
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

  static upgradePrimaryColumn(db: Database.Database) {
    const selectStmt = db.prepare(`SELECT * FROM data_tables`);
    const updateStmt = db.prepare(
      `UPDATE data_tables SET columns = ?, rows = ?, update_time = ? WHERE id = ?`,
    );

    const tables = selectStmt.all();

    tables.forEach((table: unknown) => {
      const tableData = table as { id: number; columns: string; rows: string };
      const columns = JSON.parse(tableData.columns || "[]");
      const rows = JSON.parse(tableData.rows || "[]");
      let hasChanges = false;

      // 检查是否已有主列
      const hasPrimaryColumn = columns.some(
        (col: { isPrimary?: boolean }) => col.isPrimary,
      );

      if (!hasPrimaryColumn) {
        // 查找第一个 text 类型的列
        const firstTextColumn = columns.find(
          (col: { type: string }) => col.type === "text",
        );

        if (firstTextColumn) {
          // 设置为主列
          firstTextColumn.isPrimary = true;
        } else {
          // 创建新的主列
          const newPrimaryColumn = {
            id: `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: "名称",
            type: "text",
            width: 200,
            isPrimary: true,
          };
          columns.unshift(newPrimaryColumn);

          // 为所有行添加这个新列
          rows.forEach((row: Record<string, unknown>) => {
            row[newPrimaryColumn.id] = "";
          });
        }
        hasChanges = true;
      }

      // 为所有行添加 detailContentId 字段（如果不存在）
      rows.forEach((row: Record<string, unknown>) => {
        if (row.detailContentId === undefined) {
          row.detailContentId = 0;
          hasChanges = true;
        }
      });

      if (hasChanges) {
        updateStmt.run(
          JSON.stringify(columns),
          JSON.stringify(rows),
          Date.now(),
          tableData.id,
        );
      }
    });
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

  static parse(row: Record<string, unknown>): DataTable {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      columns: JSON.parse((row.columns as string) || "[]"),
      rows: JSON.parse((row.rows as string) || "[]"),
      activeViewId: (row.active_view_id as number | null) ?? null,
      refCount: (row.ref_count as number | undefined) ?? 0,
    };
  }

  static getById(db: Database.Database, id: number): DataTable | null {
    const stmt = db.prepare(`SELECT * FROM data_tables WHERE id = ?`);
    const row = stmt.get(id);
    if (!row) return null;
    return this.parse(row as Record<string, unknown>);
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

    const result = this.getById(db, id);
    if (!result) {
      throw new Error(`Failed to create data table with id ${id}`);
    }
    return result;
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
    // 先获取表数据，删除所有行的 detailContentId 关联的内容
    const table = this.getById(db, id);
    if (table) {
      table.rows.forEach((row) => {
        if (row.detailContentId && row.detailContentId > 0) {
          ContentTable.deleteContent(db, row.detailContentId as number);
        }
      });
    }

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
      // 删除表前，先删除所有行的 detailContentId 关联的内容
      const table = this.getById(db, id);
      if (table) {
        table.rows.forEach((row) => {
          if (row.detailContentId && row.detailContentId > 0) {
            ContentTable.deleteContent(db, row.detailContentId as number);
          }
        });
      }

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
