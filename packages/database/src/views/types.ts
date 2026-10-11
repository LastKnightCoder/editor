import type { ComponentType } from "react";
import type {
  CellValue,
  ColumnDef,
  DatabaseConfig,
  DatabaseViewType,
  FieldCapabilities,
  RowData,
} from "../types";
import type PluginManager from "../PluginManager";

/** 四个视图组件统一的 props：共用字段必填，各视图专用字段可选（不用的视图忽略） */
export interface DatabaseViewComponentProps {
  pluginManager: PluginManager;
  theme: "light" | "dark";
  readonly: boolean;
  onRowDetailOpen?: (row: RowData) => void;
  onRowAdd?: (defaultData?: Partial<RowData>) => void;
  onRowDelete?: (rowId: string) => void | Promise<void>;
  config?: DatabaseConfig;
  /** 表格视图专用：列宽拖拽起点 */
  startResize?: (columnId: string, startX: number, startWidth: number) => void;
  /** 日历视图专用：铺在页面纸上，工具栏左右内距对齐页签条 */
  bare?: boolean;
}

/** 创建某视图必须选定的一列：候选列由字段能力决定，无候选时该视图不可选 */
export interface RequiredColumnSpec {
  capability: keyof FieldCapabilities;
  /** 无候选列时按钮禁用并展示的原因 */
  unavailableReason: string;
  /** 创建弹窗中列选择器的标签 */
  columnLabel: string;
  /** 创建弹窗中列选择器的占位文案 */
  columnPlaceholder: string;
}

/** 视图编辑面板中的专属配置区块（受控）；未声明 OptionsPanel 的视图无专属配置 */
export interface ViewOptionsPanelProps<TOptions> {
  options: TOptions | undefined;
  onChange(options: TOptions | undefined): void;
  /** 按当前视图列序排列的列 */
  columns: ColumnDef[];
  pluginManager: PluginManager;
  /** 配置不满足保存条件时置 false（如看板未选分组列）；缺省视为可保存 */
  setCanSave?(ok: boolean): void;
}

/** 分组函数的输入：rows 为筛选排序后的行序 */
export interface ViewGroupingContext<TOptions = unknown> {
  rows: RowData[];
  columns: ColumnDef[];
  columnMap: Map<string, ColumnDef>;
  options: TOptions | undefined;
  plugins: PluginManager;
}

/** 投影产出的一个行组：通用 groupBy 与视图自带分组（看板）共用 */
export interface RowGroup {
  key: string;
  label: string;
  rows: RowData[];
  column: ColumnDef | null;
  value?: CellValue;
}

/**
 * 视图定义：元数据、组件与专属配置面板合一（D-130）。
 * TOptions 仅约束 createOptions / OptionsPanel / grouping 的配置形态，注册表中以 any 擦除共存。
 */
export interface DatabaseViewDefinition<TOptions = any> {
  /** 扩展视图要求带命名空间（含 "."），内置四个不带 */
  type: DatabaseViewType;
  /** 选择列表展示名，也用于创建时的默认视图名 */
  name: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  Component: ComponentType<DatabaseViewComponentProps>;
  requiredColumn?: RequiredColumnSpec;
  /** 创建视图时写入 viewOptions[type] 的初始配置 */
  createOptions?(columnId?: string): TOptions | undefined;
  /** 视图编辑面板中的专属配置区块（受控）；未声明则无专属配置 */
  OptionsPanel?: ComponentType<ViewOptionsPanelProps<TOptions>>;
  /**
   * 投影行为：缺省走通用 groupBy（表格/画廊）；"none" 禁用通用分组（日历）；
   * "view" 表示本视图自行分组、投影输出单组且 grouped 为 true；函数形态返回分组结果（看板），
   * grouped 恒为 true。三者均不消费 viewConfig.groupBy。
   */
  grouping?: "view" | "none" | ((ctx: ViewGroupingContext<TOptions>) => RowGroup[]);
}
