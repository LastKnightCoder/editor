import Database from "better-sqlite3";
import {
  DataTable,
  CreateDataTable,
  UpdateDataTable,
  PatchDataTableRow,
  ApplyDataTableChanges,
} from "@/types";
import { collectDataTableContentRefs, diffContentRefs } from "@tau/shared/data-table-content-refs";
import Operation from "./operation";
import DataTableViewTable from "./data-table-view";
import ContentTable from "./content";

export default class DataTableTable {
  static upgradePrimaryColumn(db: Database.Database) {
    const selectStmt = db.prepare(`SELECT * FROM data_tables`);
    const updateStmt = db.prepare(
      `UPDATE data_tables SET columns = ?, rows = ?, update_time = ? WHERE id = ?`
    );

    const tables = selectStmt.all();

    tables.forEach((table: unknown) => {
      const tableData = table as { id: number; columns: string; rows: string };
      const columns = JSON.parse(tableData.columns || "[]");
      const rows = JSON.parse(tableData.rows || "[]");
      let hasChanges = false;

      // 检查是否已有主列
      const hasPrimaryColumn = columns.some((col: { isPrimary?: boolean }) => col.isPrimary);

      if (!hasPrimaryColumn) {
        // 查找第一个 text 类型的列
        const firstTextColumn = columns.find((col: { type: string }) => col.type === "text");

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
        updateStmt.run(JSON.stringify(columns), JSON.stringify(rows), Date.now(), tableData.id);
      }
    });
  }

  static getListenEvents() {
    return {
      "data-table:create": this.create.bind(this),
      "data-table:update": this.update.bind(this),
      "data-table:patch-row": this.patchRow.bind(this),
      "data-table:apply-changes": this.applyChanges.bind(this),
      "data-table:get-by-id": this.getById.bind(this),
      "data-table:get-detail": this.getDetail.bind(this),
      "data-table:set-active-view": this.setActiveView.bind(this),
      "data-table:delete": this.remove.bind(this),
      "data-table:increment-ref-count": this.incrementRefCount.bind(this),
    } as const;
  }

  /**
   * 同一事务内按「写入前 vs 写入后」的正文引用差集同步：新增 retain（撤销待回收），
   * 减少 releaseDeferred（归零只登记不硬删）。调用方须保证表存活（ref_count > 0），
   * 已删除的表不持有任何引用（D-129）。
   */
  private static syncContentRefs(
    db: Database.Database,
    before: Pick<DataTable, "columns" | "rows"> | null,
    after: Pick<DataTable, "columns" | "rows"> | null
  ) {
    const beforeRefs = before ? collectDataTableContentRefs(before.columns, before.rows) : null;
    const afterRefs = after ? collectDataTableContentRefs(after.columns, after.rows) : null;
    const { retain, release } = diffContentRefs(beforeRefs ?? new Map(), afterRefs ?? new Map());
    retain.forEach(contentId => ContentTable.retain(db, contentId));
    release.forEach(contentId => ContentTable.releaseDeferred(db, contentId));
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
    id: number
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
      1
    );
    const id = Number(res.lastInsertRowid);
    Operation.insertOperation(db, "data-table", "insert", id, now);

    // 新表 ref_count 为 1：持有初始 rows 中的全部正文引用（D-129）
    this.syncContentRefs(db, null, {
      columns: table.columns || [],
      rows: table.rows || [],
    });

    const view = DataTableViewTable.createDefaultView(
      db,
      id,
      table.columns || [],
      table.rows || []
    );

    const updateActiveViewStmt = db.prepare(
      `UPDATE data_tables SET active_view_id = ? WHERE id = ?`
    );
    updateActiveViewStmt.run(view.id, id);

    const result = this.getById(db, id);
    if (!result) {
      throw new Error(`Failed to create data table with id ${id}`);
    }
    return result;
  }

  static update(db: Database.Database, table: UpdateDataTable): DataTable | null {
    const stmt = db.prepare(`
      UPDATE data_tables SET
        update_time = ?,
        columns = ?,
        rows = ?,
        active_view_id = ?
      WHERE id = ?
    `);
    const now = Date.now();
    const before = this.getById(db, table.id);
    stmt.run(
      now,
      JSON.stringify(table.columns || []),
      JSON.stringify(table.rows || []),
      table.activeViewId ?? null,
      table.id
    );
    Operation.insertOperation(db, "data-table", "update", table.id, now);

    // 全量替换的引用差集：表存活才持有引用，已删除的表不同步（D-129）
    if (before && (before.refCount ?? 0) > 0) {
      this.syncContentRefs(db, before, {
        columns: table.columns || [],
        rows: table.rows || [],
      });
    }

    DataTableViewTable.syncViewsWithTable(db, table.id, table.columns || [], table.rows || []);

    return this.getById(db, table.id);
  }

  static patchRow(db: Database.Database, input: PatchDataTableRow): boolean {
    return db.transaction(() => {
      const table = this.getById(db, input.tableId);
      if (!table || (table.refCount ?? 0) <= 0) return false;
      const row = table.rows.find(item => item.id === input.rowId);
      if (!row) return false;
      const fields = Object.keys(input.patch).filter(field => field !== "id");
      if (!fields.length) return false;
      for (const field of fields) {
        if (field !== "detailContentId" && !table.columns.some(column => column.id === field))
          return false;
        if (!Object.hasOwn(input.expected, field)) return false;
        const actual = field === "detailContentId" ? row[field] || 0 : (row[field] ?? null);
        const expected =
          field === "detailContentId"
            ? input.expected[field] || 0
            : (input.expected[field] ?? null);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
      }
      const patch = Object.fromEntries(fields.map(field => [field, input.patch[field]]));
      const rows = table.rows.map(item => (item.id === input.rowId ? { ...item, ...patch } : item));
      const now = Date.now();
      db.prepare("UPDATE data_tables SET rows = ?, update_time = ? WHERE id = ?").run(
        JSON.stringify(rows),
        now,
        table.id
      );
      Operation.insertOperation(db, "data-table", "update", table.id, now);
      // 补丁可能改 detailContentId 或 rich-text 单元格：同一事务内按差集同步引用（D-129）
      this.syncContentRefs(db, table, { columns: table.columns, rows });
      return true;
    })();
  }

  static applyChanges(db: Database.Database, input: ApplyDataTableChanges): DataTable | null {
    return db.transaction(() => {
      const table = this.getById(db, input.id);
      if (!table || (table.refCount ?? 0) <= 0) return null;
      const removed = new Set(input.rows.remove);
      const inserted = new Set(input.rows.inserted ?? []);
      const patches = new Map(input.rows.upsert.map(row => [row.id, row]));
      const columns = input.columns ?? table.columns;
      const removedColumns = table.columns.filter(
        column => !columns.some(next => next.id === column.id)
      );
      const rows = table.rows
        .filter(row => !removed.has(row.id))
        .map(row => {
          const patch = patches.get(row.id);
          patches.delete(row.id);
          const allowed = Object.fromEntries(
            Object.entries(patch ?? {}).filter(
              ([field]) =>
                field !== "id" &&
                (field === "detailContentId" || columns.some(column => column.id === field))
            )
          );
          const next = inserted.has(row.id) ? { ...row } : { ...row, ...allowed };
          for (const column of removedColumns) delete next[column.id];
          return next;
        });
      for (const [id, row] of patches) {
        if (inserted.has(id) && !removed.has(id)) rows.push(row);
      }
      const now = Date.now();
      db.prepare("UPDATE data_tables SET columns = ?, rows = ?, update_time = ? WHERE id = ?").run(
        JSON.stringify(columns),
        JSON.stringify(rows),
        now,
        table.id
      );
      // 删除行 / 删除列的正文引用随差集进入延迟回收，撤销重加即恢复（D-129）
      this.syncContentRefs(db, table, { columns, rows });
      DataTableViewTable.syncViewsWithTable(db, table.id, columns, rows);
      Operation.insertOperation(db, "data-table", "update", table.id, now);
      return this.getById(db, table.id);
    })();
  }

  static remove(db: Database.Database, id: number): number {
    // 读-改-写同事务：剪切/删除数据库块只减引用，撤销/粘贴经 incrementRefCount 复活，
    // 因此不硬删任何正文；引用由 >0 变 <=0 时才把当前全部引用交给延迟回收（D-129）
    return db.transaction(() => {
      const table = this.getById(db, id);
      const stmt = db.prepare(`
        UPDATE data_tables SET ref_count = ref_count - 1 WHERE id = ?
      `);
      const changes = stmt.run(id).changes;

      Operation.insertOperation(db, "data-table", "delete", id, Date.now());

      if (table && (table.refCount ?? 0) > 0 && (table.refCount ?? 0) - 1 <= 0) {
        this.syncContentRefs(db, table, null);
      }

      return changes;
    })();
  }

  static incrementRefCount(db: Database.Database, id: number): number {
    // 读-改-写同事务：撤销/粘贴让已删除的表复活（<=0 变 >0）时重新持有全部引用（D-129）
    return db.transaction(() => {
      const table = this.getById(db, id);
      const stmt = db.prepare(`
        UPDATE data_tables SET ref_count = ref_count + 1 WHERE id = ?
      `);
      const changes = stmt.run(id).changes;

      if (changes > 0) {
        const updateTimeStmt = db.prepare(`UPDATE data_tables SET update_time = ? WHERE id = ?`);
        updateTimeStmt.run(Date.now(), id);
        // 只在恰好由 0 变 1 时复活：重复 remove 留下的负值加一后仍是已删除表
        if (table && (table.refCount ?? 0) === 0) {
          this.syncContentRefs(db, null, table);
        }
      }

      return changes;
    })();
  }

  static setActiveView(
    db: Database.Database,
    payload: { tableId: number; viewId: number | null }
  ): DataTable | null {
    const stmt = db.prepare(
      `UPDATE data_tables SET active_view_id = ?, update_time = ? WHERE id = ?`
    );
    const now = Date.now();
    stmt.run(payload.viewId ?? null, now, payload.tableId);
    Operation.insertOperation(db, "data-table", "update", payload.tableId, now);
    return this.getById(db, payload.tableId);
  }
}
