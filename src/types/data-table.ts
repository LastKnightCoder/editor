export interface DataTableColumn {
  id: string;
  title: string;
  type: string;
  width?: number;
  config?: unknown;
  validation?: unknown;
  hidden?: boolean;
}

export interface DataTableRow {
  id: string;
  [columnId: string]: unknown;
}

export interface DataTable {
  id: number;
  createTime: number;
  updateTime: number;
  columns: DataTableColumn[];
  rows: DataTableRow[];
  columnOrder: string[];
}

export type CreateDataTable = Omit<
  DataTable,
  "id" | "createTime" | "updateTime"
>;
export type UpdateDataTable = Omit<DataTable, "createTime" | "updateTime">;
