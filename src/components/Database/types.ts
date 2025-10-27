import {
  CreateDataTableView,
  DataTableView,
  GroupRule,
  SortRule,
} from "@/types";
import { SELECT_COLORS } from "./constants";
import { ImageItem } from "./plugins/ImagePlugin/types";

export interface ColumnDef<T = unknown> {
  id: string;
  title: string;
  type: string; // "text" | "number" | "date" | "select" | "multiSelect" | "custom"
  width?: number;
  config?: T; // 列类型特定配置（例如，选择的选项）
  validation?: ValidationRule;
  hidden?: boolean;
  isPrimary?: boolean;
}

export type CellValue =
  | string
  | number
  | boolean
  | string[] // 多选
  | ImageItem[] // 图片
  | any; // 自定义类型

export interface RowData {
  id: string;
  detailContentId?: number;
  [columnId: string]: CellValue;
}

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

export interface DatabaseData {
  columns: ColumnDef[];
  rows: RowData[];
}

export interface DatabaseProps {
  data: RowData[];
  columns: ColumnDef[];
  views: DataTableView[];
  activeViewId: number;
  viewConfig: TableViewConfig;
  plugins?: CellPlugin<unknown>[];
  onDataChange?: (data: DatabaseData) => void;
  onViewConfigChange?: (config: TableViewConfig) => void;
  onActiveViewIdChange?: (viewId: number | null) => Promise<void>;
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
      type?: "table" | "gallery";
      galleryConfig?: GalleryViewConfig;
    },
  ) => Promise<DataTableView | null>;
  onReorderViews?: (orderedIds: number[]) => Promise<void>;
  theme?: "light" | "dark";
  readonly?: boolean;
  className?: string;
}

export interface GalleryViewConfig {
  coverType: "detail" | "image";
  coverImageColumnId?: string;
}

export interface TableViewConfig {
  columnOrder: string[];
  rowOrder: string[];
  groupBy?: GroupRule | null;
  sorts: SortRule[];
  filters?: FilterGroup | null;
  galleryConfig?: GalleryViewConfig;
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

export interface ValidationRule {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: CellValue) => string | null; // 返回错误信息
}

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
