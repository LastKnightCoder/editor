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
  [columnId: string]: CellValue;
}

export interface TableData {
  columns: ColumnDef[];
  rows: RowData[];
  columnOrder: string[];
}

export interface TableProps {
  columns: ColumnDef[];
  data: RowData[];
  columnOrder: string[];
  plugins?: CellPlugin<unknown>[];
  onChange?: (data: TableData) => void;
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
    onCellValueChange?: (newValue: CellValue) => void;
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
  editable?: boolean;
  onMount?: () => void;
  onUnmount?: () => void;
  beforeSave?: (value: CellValue, config: T) => CellValue;
  afterLoad?: (value: CellValue, config: T) => CellValue;
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
  columnOrder: string[];
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
