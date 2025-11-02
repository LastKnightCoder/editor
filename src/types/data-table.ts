export interface DataTableColumn {
  id: string;
  title: string;
  type: string;
  width?: number;
  config?: unknown;
  validation?: unknown;
  hidden?: boolean;
  isPrimary?: boolean;
}

export interface DataTableRow {
  id: string;
  detailContentId?: number;
  [columnId: string]: unknown;
}

export interface DataTable {
  id: number;
  createTime: number;
  updateTime: number;
  columns: DataTableColumn[];
  rows: DataTableRow[];
  activeViewId: number | null;
  refCount?: number;
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
  height?: number;
}

export interface GalleryViewConfig {
  coverType: "detail" | "image";
  coverImageColumnId?: string;
}

export interface CalendarViewConfig {
  dateColumnId?: string; // 用于日历显示的日期列ID
}

export interface KanbanViewConfig {
  groupColumnId: string; // 用于分类的单选列ID
  columnOrder?: string[]; // 看板列的显示顺序（选项ID数组）
}

export interface DataTableViewConfig {
  columnOrder: string[];
  rowOrder: string[];
  filters: FilterRuleGroup | null;
  sorts: SortRule[];
  groupBy?: GroupRule | null;
  galleryConfig?: GalleryViewConfig;
  calendarConfig?: CalendarViewConfig;
  kanbanConfig?: KanbanViewConfig;
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

export type DataTableViewType = "table" | "gallery" | "calendar" | "kanban";

export type FilterLogicOperator = "and" | "or";

export interface FilterRuleCondition {
  id: string;
  type: "condition";
  fieldId: string | null;
  operator: string | null;
  value: unknown;
}

export interface FilterRuleGroup {
  id: string;
  type: "group";
  logic: FilterLogicOperator;
  children: FilterRule[];
}

export type FilterRule = FilterRuleCondition | FilterRuleGroup;

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
