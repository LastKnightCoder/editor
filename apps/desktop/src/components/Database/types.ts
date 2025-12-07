import {
  ColumnDef as SharedColumnDef,
  CellValue as SharedCellValue,
  RowData as SharedRowData,
  DatabaseData as SharedDatabaseData,
  DataTableView,
  CreateDataTableView,
  UpdateDataTableView,
  TableViewConfig,
  GalleryViewConfig,
  CalendarViewConfig,
  KanbanViewConfig,
  SortRule,
  GroupRule,
  FilterGroup,
  FilterNode,
  FilterCondition,
  FilterLogicOperator,
  ValidationRule,
} from "@tau/shared";
import { SELECT_COLORS } from "./constants";
import { ImageItem } from "./plugins/ImagePlugin/types";

// Re-export shared types
export type {
  DataTableView,
  CreateDataTableView,
  UpdateDataTableView,
  TableViewConfig,
  GalleryViewConfig,
  CalendarViewConfig,
  KanbanViewConfig,
  SortRule,
  GroupRule,
  FilterGroup,
  FilterNode,
  FilterCondition,
  FilterLogicOperator,
  ValidationRule,
};

// Extend shared types with local specifics
export type ColumnDef<T = unknown> = SharedColumnDef<T>;
export type CellValue = SharedCellValue | ImageItem[];
export type RowData = SharedRowData;
export type DatabaseData = SharedDatabaseData;

// Database-specific configuration
export interface DatabaseConfig {
  allowAddColumn?: boolean;
  allowDeleteColumn?: boolean;
  allowAddRow?: boolean;
  allowDeleteRow?: boolean;
}

export interface DatabaseProps {
  data: RowData[];
  columns: ColumnDef[];
  views: DataTableView[];
  activeViewId: number;
  viewConfig: TableViewConfig;
  config?: DatabaseConfig;
  plugins?: CellPlugin<unknown>[];
  onDataChange?: (data: DatabaseData) => void;
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
    },
  ) => Promise<DataTableView | null>;
  onReorderViews?: (orderedIds: number[]) => Promise<void>;
  onRowDetailOpen?: (row: RowData) => void;
  onRowAdd?: (defaultData?: Partial<RowData>) => void;
  onRowDelete?: (rowId: string) => Promise<void>;
  theme?: "light" | "dark";
  readonly?: boolean;
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
  }>;
  getGroupKey?: (row: RowData, column: ColumnDef) => string;
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
    column: ColumnDef<TColumnConfig>,
  ) => boolean;
}
