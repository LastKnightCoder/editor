import type {
  ColumnDef as SharedColumnDef,
  CellValue as SharedCellValue,
  RowData as SharedRowData,
  DatabaseData as SharedDatabaseData,
  DataTableView,
  DataTableViewType,
  CreateDataTableView,
  UpdateDataTableView,
  TableViewConfig,
  GalleryViewConfig,
  CalendarViewConfig,
  KanbanViewConfig,
  KanbanCardTemplate,
  KanbanCardDisplayConfig,
  SortRule,
  GroupRule,
  GroupGranularity,
  FilterGroup,
  FilterNode,
  FilterCondition,
  FilterLogicOperator,
  ValidationRule,
} from "@tau/shared/database-types";
import { SELECT_COLORS } from "./constants";
import type { DatabaseImage, DatabaseSlots } from "./DatabaseHostContext";

// Re-export shared types
export type {
  DataTableView,
  DataTableViewType,
  CreateDataTableView,
  UpdateDataTableView,
  TableViewConfig,
  GalleryViewConfig,
  CalendarViewConfig,
  KanbanViewConfig,
  KanbanCardTemplate,
  KanbanCardDisplayConfig,
  SortRule,
  GroupRule,
  GroupGranularity,
  FilterGroup,
  FilterNode,
  FilterCondition,
  FilterLogicOperator,
  ValidationRule,
};

// Extend shared types with local specifics
export type ColumnDef<T = unknown> = SharedColumnDef<T>;
export type CellValue = SharedCellValue | DatabaseImage[];
export type RowData = SharedRowData;
export type DatabaseData = SharedDatabaseData;

/** 会话查询与持久视图共同组成一次查询，分组策略显式指定。 */
export interface DatabaseQuery {
  text: string;
  filters: FilterGroup | null;
  searchResults: readonly string[] | null;
  grouping: "view" | "none";
}

export interface RowChanges {
  upsert: RowData[];
  remove: string[];
}

export type DatabaseCommand =
  | { type: "rows.apply"; changes: RowChanges }
  | { type: "rows.receive"; rows: RowData[] }
  | { type: "column.configure"; id: string; config: unknown }
  | { type: "column.resize"; id: string; width: number }
  | { type: "view.receive"; view: DataTableView; activate?: boolean }
  | { type: "view.remove"; id: number }
  | { type: "views.reorder"; ids: number[] };

export interface DatabaseChange {
  source: "user" | "external";
  rows: RowChanges;
  dataChanged: boolean;
  viewChanged: boolean;
}

// Database-specific configuration
export interface DatabaseConfig {
  allowAddColumn?: boolean;
  allowDeleteColumn?: boolean;
  allowAddRow?: boolean;
  allowDeleteRow?: boolean;
}

export interface DatabaseProps {
  /** 初始数据；挂载后的外部变更通过 DatabaseRef 显式操作。 */
  data: RowData[];
  columns: ColumnDef[];
  views: DataTableView[];
  activeViewId: number;
  viewConfig: TableViewConfig;
  config?: DatabaseConfig;
  plugins?: CellPlugin<unknown>[];
  slots?: DatabaseSlots;
  onRowCleanup?: (row: RowData) => void | Promise<void>;
  onDataChange?: (data: DatabaseData, change: DatabaseChange) => void;
  onViewConfigChange?: (config: TableViewConfig) => void;
  onActiveViewIdChange?: (viewId: number | null) => Promise<void>;
  onCreateView?: (view: CreateDataTableView) => Promise<DataTableView | null>;
  onDeleteView?: (viewId: number) => Promise<number | null>;
  onRenameView?: (viewId: number, name: string) => Promise<DataTableView | null>;
  onUpdateView?: (
    viewId: number,
    updates: {
      name?: string;
      type?: "table" | "gallery" | "calendar" | "kanban";
      galleryConfig?: GalleryViewConfig;
      calendarConfig?: CalendarViewConfig;
      kanbanConfig?: KanbanViewConfig;
    }
  ) => Promise<DataTableView | null>;
  onReorderViews?: (orderedIds: number[]) => Promise<void>;
  onRowDetailOpen?: (row: RowData) => void;
  onRowAdd?: (defaultData?: Partial<RowData>) => void;
  onRowDelete?: (rowId: string) => Promise<void>;
  theme?: "light" | "dark";
  readonly?: boolean;
  /** 嵌在页面那张纸内：去掉自身卡片外壳（底色 / 描边 / 阴影 / 圆角），页签条与表格直接铺在纸上 */
  bare?: boolean;
  className?: string;
}

export interface CellPlugin<T> {
  type: string;
  name: string;
  // 列头显示的图标
  Icon?: React.ComponentType<{ className?: string }>;
  Renderer: React.ComponentType<{
    value: CellValue;
    column: ColumnDef;
    theme: "light" | "dark";
    readonly: boolean;
    onCellValueChange: (newValue: CellValue) => void;
  }>;
  // 单元格编辑器组件
  Editor?: React.ComponentType<{
    value: CellValue;
    column: ColumnDef;
    onCellValueChange: (newValue: CellValue) => void;
    onFinishEdit: () => void;
    onColumnChange: (column: ColumnDef) => void;
    theme: "light" | "dark";
    readonly: boolean;
    autoOpen?: boolean;
  }>;
  getGroupKey?: (row: RowData, column: ColumnDef, granularity?: GroupGranularity) => string;
  sort?: (params: {
    a: CellValue;
    b: CellValue;
    column: ColumnDef;
    direction: "asc" | "desc";
    columnConfig: T | undefined;
    rowA: RowData;
    rowB: RowData;
  }) => number;
  editable?: boolean;
  onMount?: () => void;
  onUnmount?: () => void;
  beforeSave?: (value: CellValue, config: T) => CellValue;
  afterLoad?: (value: CellValue, config: T) => CellValue;
  onColumnCleanup?: (columnData: CellValue[]) => Promise<void> | void;
  filters?: CellFilterDefinition<T>[];
  search?: (searchValue: string, cellValue: CellValue, column: ColumnDef, row: RowData) => boolean;
}

// ValidationRule is imported from @tau/shared

export interface TableSnapshot {
  columns: ColumnDef[];
  rows: RowData[];
  viewConfig: TableViewConfig;
}

export interface CellCoord {
  rowId: string;
  columnId: string;
}

export interface SelectedRegion {
  start: CellCoord;
  end: CellCoord;
}

export interface SelectOption {
  id: string;
  name: string;
  color: (typeof SELECT_COLORS)[number];
}

export interface CellFilterDefinition<TColumnConfig> {
  operator: string;
  label?: string;
  requiresValue?: boolean;
  getInitialValue?: (column: ColumnDef<TColumnConfig>) => CellValue | null;
  filter: (
    filterValue: CellValue | null,
    row: RowData,
    column: ColumnDef<TColumnConfig>
  ) => boolean;
}
