import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import { DatabaseItem, DatabaseItemSummary, CreateDatabaseItem, UpdateDatabaseItem } from "@/types";
import Operation from "./operation";
import DataTableTable from "./data-table";
import { getNextModuleEntityId } from "./module-entity-id";

/**
 * 「数据库」模块的列表实体表。
 * 原先由 project 表承载（project_type = 'data-table'），拆分为独立模块后独立成表。
 * 明细仍是 data_tables / data_table_views，通过 data_table_id 指向，
 * data_tables.ref_count 的持有者由 project 换成了这里。
 */
export default class DatabaseItemTable {
  static getListenEvents() {
    return {
      "database-item:create": this.create.bind(this),
      "database-item:update": this.update.bind(this),
      "database-item:delete": this.remove.bind(this),
      "database-item:get": this.getById.bind(this),
      "database-item:list": this.list.bind(this),
      "database-item:record-open": this.recordOpen.bind(this),
    };
  }

  static parse(row: Record<string, unknown>): DatabaseItem {
    return {
      id: row.id as number,
      createTime: row.create_time as number,
      updateTime: row.update_time as number,
      title: row.title as string,
      desc: JSON.parse((row.desc as string) || "[]"),
      archived: Boolean(row.archived),
      pinned: Boolean(row.pinned),
      dataTableId: (row.data_table_id as number | undefined) ?? 0,
    };
  }

  static getById(db: Database.Database, id: number): DatabaseItem | null {
    const row = db.prepare(`SELECT * FROM database_item WHERE id = ?`).get(id);
    if (!row) return null;
    return this.parse(row as Record<string, unknown>);
  }

  /** 列表：附带行数（卡片大数字，由 SQLite 直接数 JSON 数组长度，不把 rows 传到渲染层）与打开时间 */
  static list(db: Database.Database): DatabaseItemSummary[] {
    const rows = db
      .prepare(
        `SELECT di.*,
                COALESCE(json_array_length(dt.rows), 0) AS row_count
         FROM database_item di
         LEFT JOIN data_tables dt ON dt.id = di.data_table_id
         ORDER BY di.update_time DESC`
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map(row => ({
      ...this.parse(row),
      rowCount: Number(row.row_count || 0),
      openedAt: (row.last_open_time as number | null) ?? null,
    }));
  }

  // 打开记录不是内容修改：不动 update_time（列表「最近更新」口径），也不记 operation
  static recordOpen(db: Database.Database, id: number): void {
    db.prepare("UPDATE database_item SET last_open_time = ? WHERE id = ?").run(Date.now(), id);
  }

  static create(db: Database.Database, payload: CreateDatabaseItem): DatabaseItem {
    const tx = db.transaction((item: CreateDatabaseItem) => {
      const now = Date.now();

      // 默认主列，和旧 createProject 中 DataTable 分支的行为保持一致
      const defaultColumn = {
        id: uuidv4(),
        title: "名称",
        type: "text",
        width: 200,
        isPrimary: true,
      };
      const dataTable = DataTableTable.create(db, {
        columns: [defaultColumn],
        rows: [],
      });

      const id = getNextModuleEntityId(db);
      db.prepare(
        `
          INSERT INTO database_item
          (id, create_time, update_time, title, desc, archived, pinned, data_table_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        id,
        now,
        now,
        item.title,
        JSON.stringify(item.desc || []),
        Number(item.archived || false),
        Number(item.pinned || false),
        dataTable.id
      );

      Operation.insertOperation(db, "database-item", "insert", id, now);
      return id;
    });

    const id = tx(payload);
    const created = this.getById(db, id);
    if (!created) {
      throw new Error(`Failed to create database item with id ${id}`);
    }
    return created;
  }

  static update(db: Database.Database, payload: UpdateDatabaseItem): DatabaseItem | null {
    const existing = this.getById(db, payload.id);
    if (!existing) return null;

    const now = Date.now();
    db.prepare(
      `
        UPDATE database_item SET
          update_time = ?,
          title = ?,
          desc = ?,
          archived = ?,
          pinned = ?
        WHERE id = ?
      `
    ).run(
      now,
      payload.title,
      JSON.stringify(payload.desc ?? existing.desc),
      Number(payload.archived ?? existing.archived),
      Number(payload.pinned ?? existing.pinned),
      payload.id
    );

    Operation.insertOperation(db, "database-item", "update", payload.id, now);
    return this.getById(db, payload.id);
  }

  static remove(db: Database.Database, id: number): number {
    const item = this.getById(db, id);
    if (!item) return 0;

    // 减少数据表格引用计数（可能仍被编辑器内嵌块或文档树的 table-view 条目引用）
    if (item.dataTableId) {
      DataTableTable.remove(db, item.dataTableId);
    }

    const changes = db.prepare(`DELETE FROM database_item WHERE id = ?`).run(id).changes;
    Operation.insertOperation(db, "database-item", "delete", id, Date.now());
    return changes;
  }
}
