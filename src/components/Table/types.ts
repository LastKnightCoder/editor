import { SELECT_COLORS } from "./constants";

// 列定义
export interface ColumnDef<T = any> {
  id: string;
  title: string;
  type: string; // "text" | "number" | "date" | "select" | "multiSelect" | "custom"
  width?: number;
  config?: T; // 列类型特定配置（例如，选择的选项）
  validation?: ValidationRule;
  hidden?: boolean;
  sortDirection?: "asc" | "desc" | null;
  icon?: string; // 列图标名称
}

// 单元格值（动态类型）
export type CellValue =
  | string // 文本，数字（需要转换）
  | number
  | Date
  | string[] // 多选
  | any; // 自定义类型

// 行数据
export interface RowData {
  id: string; // 唯一标识符
  [columnId: string]: CellValue;
}

/**
 * 表格数据类型，用于onChange回调
 */
export interface TableData {
  columns: ColumnDef[];
  rows: RowData[];
}

/**
 * 表格属性
 */
export interface TableProps {
  columns: ColumnDef[];
  data: RowData[];
  plugins?: CellPlugin[];
  onChange?: (data: TableData) => void;
}

// 单元格插件接口
export interface CellPlugin {
  type: string;
  // 只读模式渲染器
  Renderer: React.ComponentType<{
    value: CellValue;
    config?: any;
    column: ColumnDef;
  }>;
  // 可选的编辑器组件
  Editor?: React.ComponentType<{
    value: CellValue;
    config?: any;
    column: ColumnDef;
    onCellValueChange: (newValue: CellValue) => void;
    onBlur: () => void;
    onColumnChange: (column: ColumnDef) => void;
  }>;
  onMount?: () => void;
  onUnmount?: () => void;
  beforeSave?: (value: CellValue) => CellValue;
  afterLoad?: (value: CellValue) => CellValue;
}

// 验证规则
export interface ValidationRule {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: CellValue) => string | null; // 返回错误信息
}

// 表格交互类型
export type TableInteraction =
  | { type: "CELL_CLICK"; rowId: string; columnId: string }
  | { type: "CELL_DOUBLE_CLICK"; rowId: string; columnId: string }
  | { type: "COLUMN_RESIZE"; columnId: string; deltaX: number }
  | {
      type: "KEYBOARD_NAVIGATION";
      direction: "up" | "down" | "left" | "right";
    };

// 表格快照用于撤销/重做
export interface TableSnapshot {
  columns: ColumnDef[];
  rows: RowData[];
  columnOrder: string[];
}

// 单元格坐标
export interface CellCoord {
  rowId: string;
  columnId: string;
}

// 选定区域
export interface SelectedRegion {
  start: CellCoord;
  end: CellCoord;
}

export interface SelectOption {
  id: string;
  name: string;
  color: (typeof SELECT_COLORS)[number];
}
