import type {
  ColumnDef as SharedColumnDef,
  CellValue as SharedCellValue,
  DataTableViewType,
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
  AggregateOp,
  FooterSpec,
} from "@tau/shared/database-types";
import type { Scalar, ValueType } from "./core/formula/types";
import type { SELECT_COLORS } from "./constants";
import type { DatabaseImage } from "./DatabaseHostContext";
import type { DatabaseExtension } from "./extensions";
import type { DatabaseFieldModel } from "./model/field-model";
import type PluginManager from "./PluginManager";

// Re-export shared types
export type {
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
  AggregateOp,
  FooterSpec,
};

// Extend shared types with local specifics
export type ColumnDef<T = unknown> = SharedColumnDef<T>;
export type CellValue = SharedCellValue | DatabaseImage[];
export interface RowData {
  id: string;
  [columnId: string]: CellValue;
}

export interface DatabaseData {
  columns: ColumnDef[];
  rows: RowData[];
}

/** 视图类型 union：与持久化模型共用 @tau/shared 的单一来源 */
export type DatabaseViewType = DataTableViewType;

export interface DatabaseView {
  id: number;
  name: string;
  type: DatabaseViewType;
  order: number;
  config: TableViewConfig;
}

export type CreateDatabaseView = Omit<DatabaseView, "id" | "config"> & {
  config?: Partial<TableViewConfig>;
};

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
  inserted?: string[];
}

export type DatabaseCommand =
  | { type: "rows.apply"; changes: RowChanges }
  | { type: "rows.receive"; rows: RowData[] }
  | { type: "column.configure"; id: string; config: unknown }
  | { type: "column.resize"; id: string; width: number }
  | { type: "view.receive"; view: DatabaseView; activate?: boolean }
  | { type: "view.remove"; id: number }
  | { type: "views.reorder"; ids: number[] };

export interface DatabaseChange {
  source: "user" | "external";
  rows: RowChanges;
  dataChanged: boolean;
  columnsChanged?: boolean;
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
  views: DatabaseView[];
  activeViewId: number;
  viewConfig: TableViewConfig;
  config?: DatabaseConfig;
  /** 声明式扩展集合；引用在实例生命周期内必须稳定，变更会抛错 */
  extensions?: readonly DatabaseExtension[];
  onRowCleanup?: (row: RowData) => void | Promise<void>;
  onDetachedRowPatch?: (
    rowId: string,
    patch: Partial<RowData>,
    previousRow: RowData
  ) => Promise<boolean>;
  onDataChange?: (data: DatabaseData, change: DatabaseChange) => void;
  onViewConfigChange?: (config: TableViewConfig) => void;
  onActiveViewIdChange?: (viewId: number | null) => Promise<void>;
  onCreateView?: (view: CreateDatabaseView) => Promise<DatabaseView | null>;
  onDeleteView?: (viewId: number) => Promise<number | null>;
  onRenameView?: (viewId: number, name: string) => Promise<DatabaseView | null>;
  onUpdateView?: (
    viewId: number,
    updates: {
      name?: string;
      type?: DatabaseViewType;
      /** 目标视图类型的专属配置对象，宿主写入 viewOptions[type] */
      viewOptions?: unknown;
    }
  ) => Promise<DatabaseView | null>;
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

export interface FieldCapabilities {
  /** 值为内置日期格式且可写回：可作日历日期列、按日期粒度分组、排序面板的日期快捷项 */
  date?: boolean;
  /** 列 config 带选项列表且值为单个选项 id：可作看板分组列、公式中按选项比较 */
  singleOption?: boolean;
  /** 值为布尔：可作看板「完成」列 */
  boolean?: boolean;
  /** 值为图片列表（DatabaseImage[]）：可作画廊/行详情封面来源 */
  images?: boolean;
}

/** 列配置编辑面板的受控 props：ColumnEditModal 在类型区下方渲染，draftConfig 由面板经 onChange 写回 */
export interface FieldConfigPanelProps<T> {
  config: T | undefined;
  onChange(config: T): void;
  /** 正在编辑的列；新建时为 null */
  column: ColumnDef<T> | null;
  columns: ColumnDef[];
  rows: RowData[];
  pluginManager: PluginManager;
  /** 弹窗当前列标题草稿（如公式预览表头的名字） */
  title: string;
  /** 保存校验失败的错误文本，与 setError 配对；面板决定展示位置 */
  error: string | null;
  setError(message: string | null): void;
}

/** validateConfig 的上下文：与列配置校验所需的环境一致（正在编辑的列、全表与插件管理器） */
export interface FieldConfigValidationContext {
  column: ColumnDef | null;
  columns: ColumnDef[];
  rows: RowData[];
  pluginManager: PluginManager;
}

/** 列配置编辑面板组件：可带 dialogWidth 静态属性声明弹窗宽度 */
export type FieldConfigPanelComponent<T> = React.ComponentType<FieldConfigPanelProps<T>> & {
  /** 配置面板需要更宽弹窗时声明（如公式构造器 880）；缺省 400 */
  dialogWidth?: number;
};

export interface CellPlugin<T> {
  type: string;
  name: string;
  /** 字段能力：声明该字段的值与内置同名格式兼容，视图与面板据此决定是否可用；静态声明，不从 valueType 推断 */
  capabilities?: FieldCapabilities;
  /** 字段的纯数据 model（值口径与配置版本迁移，D-130）；PluginManager 经 getModel 读取 */
  model?: DatabaseFieldModel<T>;
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
    onFinishEdit: (restoreFocus?: boolean) => void;
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
  beforeSave?: (value: CellValue, config: T) => CellValue;
  afterLoad?: (value: CellValue, config: T) => CellValue;
  /** 可按列决定（如公式列按结果类型给出不同操作符）；读取经 PluginManager.getFilters */
  filters?: CellFilterDefinition<T>[] | ((column: ColumnDef<T>) => CellFilterDefinition<T>[]);
  search?: (searchValue: string, cellValue: CellValue, column: ColumnDef, row: RowData) => boolean;
  /** 参与汇总与公式时的值类型（可按列决定，如公式列取其结果类型）；不声明则该字段只能计数 */
  valueType?: ValueType | ((column: ColumnDef<T>) => ValueType | undefined);
  /** afterLoad 后的值 → 参与运算的标量；缺省按 valueType 取原值，取不到为 null（空） */
  toScalar?: (value: CellValue, column: ColumnDef<T>) => Scalar;
  /** 数值汇总结果的展示文本（如沿用数字列的小数位 / 前后缀、进度显示百分比） */
  formatScalar?: (value: number, column: ColumnDef<T>) => string;
  /** 列配置编辑面板：受控组件，ColumnEditModal 在类型区下方渲染；未声明的字段保存时不改动 config */
  ConfigPanel?: FieldConfigPanelComponent<T>;
  /** 保存前的最终校验（如公式的完整性检查）；失败时 ColumnEditModal 显示错误并中止保存 */
  validateConfig?(
    config: T | undefined,
    ctx: FieldConfigValidationContext
  ): { ok: true; config: T } | { ok: false; message: string };
}

// ValidationRule is imported from @tau/shared

/** 撤销快照只覆盖数据（行与列）；视图配置不进撤销。 */
export interface TableSnapshot {
  columns: ColumnDef[];
  rows: RowData[];
  /** 仅用于把恢复的行列放回原位，不回滚视图顺序 */
  columnOrder: string[];
  rowOrder: string[];
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
