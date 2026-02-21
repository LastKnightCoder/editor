// ============ Core Database Types ============

export interface ColumnDef<T = unknown> {
  id: string;
  title: string;
  type: string;
  width?: number;
  config?: T;
  validation?: ValidationRule;
  hidden?: boolean;
  isPrimary?: boolean;
  readonly?: boolean;
}

export type CellValue = string | number | boolean | string[] | any;

export interface RowData {
  id: string;
  detailContentId?: number;
  [columnId: string]: CellValue;
}

export interface DataTable {
  id: number;
  createTime: number;
  updateTime: number;
  columns: ColumnDef[];
  rows: RowData[];
  activeViewId: number | null;
  refCount?: number;
}

export interface DatabaseData {
  columns: ColumnDef[];
  rows: RowData[];
}

// ============ View Types ============

export type DataTableViewType = "table" | "gallery" | "calendar" | "kanban";

export interface GalleryViewConfig {
  coverType: "detail" | "image";
  coverImageColumnId?: string;
}

export interface CalendarViewConfig {
  dateColumnId?: string;
}

export type KanbanCardTemplate = "compact" | "task" | "detail";

export interface KanbanCardDisplayConfig {
  template?: KanbanCardTemplate;
  doneColumnId?: string;
  visibleFieldIds?: string[];
  showFieldLabels?: boolean;
}

export interface KanbanViewConfig {
  groupColumnId: string;
  columnOrder?: string[];
  cardDisplay?: KanbanCardDisplayConfig;
}

export interface TableViewConfig {
  columnOrder: string[];
  rowOrder: string[];
  columnWidths?: Record<string, number>;
  groupBy?: GroupRule | null;
  sorts: SortRule[];
  filters?: FilterGroup | null;
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
  config: TableViewConfig;
  createTime: number;
  updateTime: number;
}

export type CreateDataTableView = Omit<
  DataTableView,
  "id" | "createTime" | "updateTime" | "config"
> & {
  config?: Partial<TableViewConfig>;
};

export type UpdateDataTableView = Omit<
  DataTableView,
  "createTime" | "updateTime"
>;

// ============ Filter Types ============

export type FilterLogicOperator = "and" | "or";

export interface FilterCondition {
  id: string;
  type: "condition";
  fieldId: string | null;
  operator: string | null;
  value: CellValue | null;
}

export interface FilterGroup {
  id: string;
  type: "group";
  logic: FilterLogicOperator;
  children: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

// ============ Sort and Group Types ============

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

// ============ Validation Types ============

export interface ValidationRule {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: CellValue) => string | null;
}

// ============ Hook Result Type ============

export interface DatabaseHookResult {
  table: DataTable | null;
  views: DataTableView[];
  activeViewId: number | null;
  onDataChange?: (data: DatabaseData) => Promise<void> | void;
  onViewConfigChange?: (config: TableViewConfig) => Promise<void> | void;
  onActiveViewIdChange?: (viewId: number | null) => Promise<void> | void;
  onCreateView?: (view: CreateDataTableView) => Promise<DataTableView | null>;
  onDeleteView?: (viewId: number) => Promise<number | null>;
  onRenameView?: (
    viewId: number,
    name: string,
  ) => Promise<DataTableView | null>;
  onUpdateView?: (
    viewId: number,
    updates: {
      name?: string;
      type?: DataTableViewType;
      galleryConfig?: GalleryViewConfig;
      calendarConfig?: CalendarViewConfig;
      kanbanConfig?: KanbanViewConfig;
    },
  ) => Promise<DataTableView | null>;
  onReorderViews?: (orderedIds: number[]) => Promise<void>;
}
