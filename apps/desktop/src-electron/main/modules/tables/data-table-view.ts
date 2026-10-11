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

type FooterSpec = NonNullable<DataTableViewConfig["footer"]>[string];

/** 只保留两种表尾形态：单列汇总、组合表达式（表达式结构由渲染端校验）；空表返回 undefined */
function normalizeFooterSpec(spec: unknown): FooterSpec | null {
  if (!spec || typeof spec !== "object") return null;
  const value = spec as Record<string, unknown>;
  if (value.kind === "aggregate" && typeof value.op === "string")
    return { kind: "aggregate", op: value.op as never };
  if (value.kind === "expr" && value.expr && typeof value.expr === "object")
    return { kind: "expr", expr: structuredClone(value.expr) as never };
  return null;
}

function normalizeFooter(footer: DataTableViewConfig["footer"]): DataTableViewConfig["footer"] {
  if (!footer || typeof footer !== "object") return undefined;
  const entries = Object.entries(footer).flatMap(([columnId, spec]) => {
    const normalized = normalizeFooterSpec(spec);
    return normalized ? [[columnId, normalized] as const] : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** 视图专属配置：按视图类型原样保留（值须为普通对象），不认识任何具体视图类型（D-137） */
function normalizeViewOptions(viewOptions: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(viewOptions)) return undefined;
  const entries = Object.entries(viewOptions).filter(([, value]) => isPlainObject(value));
  if (!entries.length) return undefined;
  return Object.fromEntries(entries.map(([key, value]) => [key, structuredClone(value)]));
}

/** 列宽持久化：只保留有限数字 */
function normalizeColumnWidths(input: unknown): Record<string, number> | undefined {
  if (!isPlainObject(input)) return undefined;
  const widths: Record<string, number> = {};
  for (const [columnId, value] of Object.entries(input)) {
    if (typeof value === "number" && Number.isFinite(value)) widths[columnId] = value;
  }
  return Object.keys(widths).length ? widths : undefined;
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
      columnWidths: normalizeColumnWidths(config?.columnWidths),
      filters: config?.filters ? structuredClone(config.filters) : null,
      sorts: config?.sorts ? [...config.sorts] : [],
      groupBy: config?.groupBy ?? null,
      viewOptions: normalizeViewOptions(config?.viewOptions),
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
