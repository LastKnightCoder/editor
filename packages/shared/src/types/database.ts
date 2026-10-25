// ============ Core Database Types ============
import type { ContentEntityTarget } from "@tau/db-schema/content-identities";
export type DataTableTarget = ContentEntityTarget;

export interface ColumnDef<T = unknown> {
  id: string;
  title: string;
  type: string;
  width?: number;
  config?: T;
  /** 字段配置版本；缺省视为 1，由字段 model 的 configVersion / migrateConfig 逐级升级（D-137） */
  configVersion?: number;
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

export interface DatabaseRowChanges {
  upsert: RowData[];
  remove: string[];
  inserted?: string[];
}

export interface DatabaseDataChange {
  rows: DatabaseRowChanges;
  columnsChanged?: boolean;
}

// ============ View Types ============

/**
 * 数据表视图类型：内置四值为 BUILT_IN_VIEW_TYPES（"table" / "gallery" / "calendar" / "kanban"）；
 * 扩展贡献的视图要求带命名空间（如 "acme.timeline"，含 "."），以免与内置及其它扩展冲突。
 * 持久化列 data_table_views.type 为 TEXT，不约束取值。
 */
export type DataTableViewType = string;

/** 内置视图类型（顺序即创建弹窗与类型下拉的展示顺序） */
export const BUILT_IN_VIEW_TYPES = ["table", "gallery", "calendar", "kanban"] as const;

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
  /** 视图专属配置：键为视图 type 字符串，值由该视图自行解释；主进程只校验为 JSON 对象（D-137） */
  viewOptions?: Record<string, unknown>;
  /** 表尾汇总：列 id → 汇总方式；未登记的列不显示汇总值 */
  footer?: Record<string, FooterSpec>;
}

// ============ Footer Types ============

export type AggregateOp =
  | "sum"
  | "avg"
  | "median"
  | "min"
  | "max"
  | "countAll"
  | "countNonEmpty"
  | "countEmpty"
  | "unique";

/**
 * 单列汇总，或以各列汇总为叶子的组合表达式。
 * aggregate.op 放宽为 string：内置 9 个见 AggregateOp（公式仍只认这些），
 * 扩展可贡献带命名空间的表尾算子（D-137）；主进程对该值只校验字符串、原样保留。
 */
export type FooterSpec = { kind: "aggregate"; op: string } | { kind: "expr"; expr: FormulaExpr };

// ============ Formula Types ============

/** 公式参与运算的值类型；date 为毫秒时间戳 */
export type FormulaValueType = "number" | "text" | "boolean" | "date";

export type FormulaBinaryOp = "+" | "-" | "*" | "/";
export type FormulaCompareOp = ">" | ">=" | "<" | "<=" | "==" | "!=" | "contains";

/**
 * 受限表达式树：只在存储与校验层使用，不向用户展示。
 * column 只出现在单行公式里，aggregate 只出现在表尾组合表达式里。
 */
export type FormulaExpr =
  | { kind: "literal"; value: number | string | boolean | null }
  | { kind: "column"; columnId: string }
  | { kind: "aggregate"; op: AggregateOp; columnId: string }
  | { kind: "binary"; op: FormulaBinaryOp; left: FormulaExpr; right: FormulaExpr }
  | { kind: "compare"; op: FormulaCompareOp; left: FormulaExpr; right: FormulaExpr }
  | { kind: "logic"; op: "and" | "or"; operands: FormulaExpr[] }
  | { kind: "not"; operand: FormulaExpr }
  | { kind: "if"; test: FormulaExpr; then: FormulaExpr; else: FormulaExpr }
  | { kind: "concat"; parts: FormulaExpr[] }
  | { kind: "empty"; operand: FormulaExpr };

/** 公式列的 ColumnDef.config；output 由校验推导后写入 */
export interface FormulaColumnConfig {
  expr: FormulaExpr;
  output: FormulaValueType;
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
  "id" | "createTime" | "updateTime" | "config" | "tableId"
> & {
  tableId: DataTableTarget;
  config?: Partial<TableViewConfig>;
};

export type UpdateDataTableView = Omit<DataTableView, "createTime" | "updateTime" | "tableId"> & {
  tableId: DataTableTarget;
};

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

/** 日期分组的聚合粒度（仅日期类字段生效，缺省按月） */
export type GroupGranularity = "day" | "week" | "month";

export interface GroupRule {
  id: string;
  fieldId: string;
  /** @deprecated 不再写入，读取方不存在；存量数据中的该键被忽略 */
  strategy?: "text" | "select" | "multiSelect" | "checkbox" | "star" | string;
  granularity?: GroupGranularity;
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
  loading?: boolean;
  error?: string;
  table: DataTable | null;
  views: DataTableView[];
  activeViewId: number | null;
  onDataChange?: (data: DatabaseData, change?: DatabaseDataChange) => Promise<void> | void;
  onViewConfigChange?: (config: TableViewConfig) => Promise<void> | void;
  onActiveViewIdChange?: (viewId: number | null) => Promise<void> | void;
  onCreateView?: (view: CreateDataTableView) => Promise<DataTableView | null>;
  onDeleteView?: (viewId: number) => Promise<number | null>;
  onRenameView?: (viewId: number, name: string) => Promise<DataTableView | null>;
  onUpdateView?: (
    viewId: number,
    updates: {
      name?: string;
      type?: DataTableViewType;
      /** 目标视图类型的专属配置对象，宿主写入 viewOptions[type] */
      viewOptions?: unknown;
    }
  ) => Promise<DataTableView | null>;
  onReorderViews?: (orderedIds: number[]) => Promise<void>;
}
