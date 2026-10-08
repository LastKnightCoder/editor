import Database from "better-sqlite3";
import type {
  DataTableView,
  DataTableViewConfig,
  CreateDataTableView,
  UpdateDataTableView,
  DataTableColumn,
  DataTableRow,
} from "@/types";
import Operation from "./operation";

/** 只保留形如 { kind: "aggregate", op } 的表尾配置；空表返回 undefined */
function normalizeFooter(footer: DataTableViewConfig["footer"]): DataTableViewConfig["footer"] {
  if (!footer || typeof footer !== "object") return undefined;
  const entries = Object.entries(footer).filter(
    ([, spec]) => spec?.kind === "aggregate" && typeof spec.op === "string"
  );
  return entries.length
    ? Object.fromEntries(
        entries.map(([columnId, spec]) => [columnId, { kind: spec.kind, op: spec.op }])
      )
    : undefined;
}

type ReorderPayload = {
  tableId: number;
  orderedIds: number[];
};

export default class DataTableViewTable {
  static getListenEvents() {
    return {
      "data-table-view:create": this.create.bind(this),
      "data-table-view:update": this.update.bind(this),
      "data-table-view:delete": this.remove.bind(this),
      "data-table-view:reorder": this.reorder.bind(this),
      "data-table-view:list-by-table": this.listByTableId.bind(this),
    } as const;
  }

  static parse(row: any): DataTableView {
    return {
      id: row.id,
      tableId: row.table_id,
      name: row.name,
      type: row.type,
      config: JSON.parse(row.config || "{}"),
      order: row.sort_order,
      createTime: row.create_time,
      updateTime: row.update_time,
    };
  }

  static normalizeConfig(config?: Partial<DataTableViewConfig>): DataTableViewConfig {
    return {
      columnOrder: config?.columnOrder ? [...config.columnOrder] : [],
      rowOrder: config?.rowOrder ? [...config.rowOrder] : [],
      filters: config?.filters ? structuredClone(config.filters) : null,
      sorts: config?.sorts ? [...config.sorts] : [],
      groupBy: config?.groupBy ?? null,
      galleryConfig: config?.galleryConfig
        ? {
            coverType: config.galleryConfig.coverType,
            coverImageColumnId: config.galleryConfig.coverImageColumnId,
          }
        : undefined,
      calendarConfig: config?.calendarConfig
        ? {
            dateColumnId: config.calendarConfig.dateColumnId,
          }
        : undefined,
      kanbanConfig: config?.kanbanConfig
        ? {
            groupColumnId: config.kanbanConfig.groupColumnId,
            columnOrder: config.kanbanConfig.columnOrder
              ? [...config.kanbanConfig.columnOrder]
              : undefined,
            cardDisplay: config.kanbanConfig.cardDisplay
              ? {
                  template: config.kanbanConfig.cardDisplay.template,
                  doneColumnId: config.kanbanConfig.cardDisplay.doneColumnId,
                  visibleFieldIds: config.kanbanConfig.cardDisplay.visibleFieldIds
                    ? [...config.kanbanConfig.cardDisplay.visibleFieldIds]
                    : undefined,
                  showFieldLabels: config.kanbanConfig.cardDisplay.showFieldLabels,
                }
              : undefined,
          }
        : undefined,
      footer: normalizeFooter(config?.footer),
    };
  }

  static listByTableId(db: Database.Database, tableId: number): DataTableView[] {
    const stmt = db.prepare(
      `SELECT * FROM data_table_views WHERE table_id = ? ORDER BY sort_order ASC, id ASC`
    );
    return stmt.all(tableId).map(row => this.parse(row));
  }

  static create(db: Database.Database, payload: CreateDataTableView): DataTableView {
    const config = this.normalizeConfig(payload.config);
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO data_table_views (
        table_id,
        name,
        type,
        config,
        sort_order,
        create_time,
        update_time
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      payload.tableId,
      payload.name,
      payload.type,
      JSON.stringify(config),
      payload.order ?? now,
      now,
      now
    );

    const id = Number(result.lastInsertRowid);
    Operation.insertOperation(db, "data-table-view", "insert", id, now);
    return this.getById(db, id)!;
  }

  static getById(db: Database.Database, id: number): DataTableView | null {
    const stmt = db.prepare(`SELECT * FROM data_table_views WHERE id = ?`);
    const row = stmt.get(id);
    if (!row) return null;
    return this.parse(row);
  }

  static update(db: Database.Database, payload: UpdateDataTableView): DataTableView | null {
    const config = this.normalizeConfig(payload.config);
    const stmt = db.prepare(`
      UPDATE data_table_views SET
        table_id = ?,
        name = ?,
        type = ?,
        config = ?,
        sort_order = ?,
        update_time = ?
      WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(
      payload.tableId,
      payload.name,
      payload.type,
      JSON.stringify(config),
      payload.order,
      now,
      payload.id
    );
    Operation.insertOperation(db, "data-table-view", "update", payload.id, now);
    return this.getById(db, payload.id);
  }

  static remove(db: Database.Database, id: number): number {
    const stmt = db.prepare(`DELETE FROM data_table_views WHERE id = ?`);
    Operation.insertOperation(db, "data-table-view", "delete", id, Date.now());
    return stmt.run(id).changes;
  }

  static reorder(db: Database.Database, payload: ReorderPayload): void {
    const stmt = db.prepare(
      `UPDATE data_table_views SET sort_order = ?, update_time = ? WHERE id = ? AND table_id = ?`
    );
    const now = Date.now();
    const transaction = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, now, id, payload.tableId);
      });
    });
    transaction(payload.orderedIds);
  }

  static ensureViewConfigIncludesColumnsAndRows(
    config: DataTableViewConfig,
    columns: DataTableColumn[],
    rows: DataTableRow[]
  ): DataTableViewConfig {
    const columnIds = columns.map(col => col.id);
    const rowIds = rows.map(row => row.id);

    const configColumns = new Set(config.columnOrder);
    const nextColumnOrder = columnIds.filter(id => configColumns.has(id));
    columnIds.forEach(id => {
      if (!configColumns.has(id)) {
        nextColumnOrder.push(id);
      }
    });

    const configRows = new Set(config.rowOrder);
    const nextRowOrder = config.rowOrder.filter(id => rowIds.includes(id));
    rowIds.forEach(id => {
      if (!configRows.has(id)) {
        nextRowOrder.push(id);
      }
    });

    return {
      ...config,
      columnOrder: nextColumnOrder,
      rowOrder: nextRowOrder,
    };
  }

  static syncViewsWithTable(
    db: Database.Database,
    tableId: number,
    columns: DataTableColumn[],
    rows: DataTableRow[]
  ): void {
    const views = this.listByTableId(db, tableId);
    const stmt = db.prepare(`UPDATE data_table_views SET config = ?, update_time = ? WHERE id = ?`);
    const now = Date.now();
    views.forEach(view => {
      const config = this.ensureViewConfigIncludesColumnsAndRows(
        this.normalizeConfig(view.config),
        columns,
        rows
      );
      stmt.run(JSON.stringify(config), now, view.id);
    });
  }

  static createDefaultView(
    db: Database.Database,
    tableId: number,
    columns: DataTableColumn[],
    rows: DataTableRow[]
  ): DataTableView {
    const config = this.ensureViewConfigIncludesColumnsAndRows(
      this.normalizeConfig(),
      columns,
      rows
    );
    return this.create(db, {
      tableId,
      name: "默认视图",
      type: "table",
      order: 0,
      config,
    });
  }
}
