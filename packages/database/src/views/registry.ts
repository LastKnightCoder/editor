import { CalendarDays, LayoutGrid, SquareKanban, Table2, type LucideIcon } from "lucide-react";
import type {
  DatabaseConfig,
  DatabaseViewType,
  FieldCapabilities,
  RowData,
  TableViewConfig,
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

export interface ViewTypeDefinition {
  type: DatabaseViewType;
  /** 选择列表展示名，也用于创建时的默认视图名 */
  name: string;
  icon: LucideIcon;
  requiredColumn?: RequiredColumnSpec;
  /** 根据选定列生成创建该视图时写入的配置片段 */
  createConfig?: (columnId: string) => Partial<TableViewConfig>;
}

/** 视图类型元数据（不含组件，避免与视图组件循环依赖）：顺序即创建弹窗与类型下拉的展示顺序 */
export const VIEW_TYPES: readonly ViewTypeDefinition[] = [
  { type: "table", name: "表格", icon: Table2 },
  { type: "gallery", name: "画廊", icon: LayoutGrid },
  {
    type: "calendar",
    name: "日历",
    icon: CalendarDays,
    requiredColumn: {
      capability: "date",
      unavailableReason: "需要至少一个日期列",
      columnLabel: "日期列",
      columnPlaceholder: "选择用于日历的日期列",
    },
    createConfig: columnId => ({ viewOptions: { calendar: { dateColumnId: columnId } } }),
  },
  {
    type: "kanban",
    name: "看板",
    icon: SquareKanban,
    requiredColumn: {
      capability: "singleOption",
      unavailableReason: "需要至少一个单选列",
      columnLabel: "分组列",
      columnPlaceholder: "选择用于看板分组的单选列",
    },
    createConfig: columnId => ({
      viewOptions: {
        kanban: {
          groupColumnId: columnId,
          cardDisplay: { template: "task", showFieldLabels: false },
        },
      },
    }),
  },
];

const seenTypes = new Set<string>();
for (const definition of VIEW_TYPES) {
  if (seenTypes.has(definition.type)) {
    throw new Error(`视图类型 "${definition.type}" 重复注册`);
  }
  seenTypes.add(definition.type);
}

const VIEW_TYPE_MAP = new Map<string, ViewTypeDefinition>(
  VIEW_TYPES.map(definition => [definition.type, definition])
);

export function getViewType(type: string): ViewTypeDefinition | undefined {
  return VIEW_TYPE_MAP.get(type);
}
