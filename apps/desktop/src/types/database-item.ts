import { Descendant } from "slate";

/**
 * 「数据库」模块的列表实体。
 * 原先是 project 表里 project_type = 'data-table' 的一行，现已独立为 database_item 表。
 * 明细数据仍存在 data_tables / data_table_views 中，由 dataTableId 指向。
 */
export interface DatabaseItem {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  desc: Descendant[];
  archived: boolean;
  pinned: boolean;
  dataTableId: number;
}

/** 列表条目：附带行数（驾驶舱卡片大数字），由主进程聚合 */
export type DatabaseItemSummary = DatabaseItem & { rowCount: number };

export type CreateDatabaseItem = Pick<DatabaseItem, "title"> &
  Partial<Pick<DatabaseItem, "desc" | "archived" | "pinned">>;

export type UpdateDatabaseItem = Pick<DatabaseItem, "id" | "title"> &
  Partial<Pick<DatabaseItem, "desc" | "archived" | "pinned">>;
