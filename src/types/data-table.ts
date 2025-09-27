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
  activeViewId: number | null;
}

export interface CreateDataTable {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  activeViewId?: number | null;
}

export interface UpdateDataTable {
  id: number;
  columns?: DataTableColumn[];
  rows?: DataTableRow[];
  activeViewId?: number | null;
}

export interface DataTableViewConfig {
  columnOrder: string[];
  rowOrder: string[];
  filters: FilterRule[];
  sorts: SortRule[];
  groupBy?: GroupRule | null;
}

export interface DataTableView {
  id: number;
  tableId: number;
  name: string;
  type: DataTableViewType;
  order: number;
  config: DataTableViewConfig;
  createTime: number;
  updateTime: number;
}

export type CreateDataTableView = Omit<
  DataTableView,
  "id" | "createTime" | "updateTime" | "config"
> & {
  config?: Partial<DataTableViewConfig>;
};

export type UpdateDataTableView = Omit<
  DataTableView,
  "createTime" | "updateTime"
>;

export type DataTableViewType = "table";

export interface FilterRule {
  id: string;
  fieldId: string;
  operator: string;
  value: unknown;
}

export interface SortRule {
  id: string;
  fieldId: string;
  direction: "asc" | "desc";
  priority: number;
}

export interface GroupRule {
  id: string;
  fieldId: string;
  strategy?: "text" | "select" | "multiSelect" | "checkbox" | "star" | string;
}
