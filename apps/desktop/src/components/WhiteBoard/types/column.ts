import { BoardElement } from "./board";
import { CommonElement } from "../plugins/CommonPlugin";

/** 列颜色（映射到主题标签色 token，各主题族色相顺序一致） */
export type ColumnColor = "green" | "blue" | "purple" | "yellow" | "red";

export interface ColumnElement extends CommonElement {
  type: "column";
  title: string;
  /** 顶部色带，缺省无色 */
  color?: ColumnColor;
  /** 折叠：只显示标题栏，子元素不渲染、不参与命中 */
  collapsed?: boolean;
  children: BoardElement[];
  padding: number;
  gap: number;
  minWidth: number;
  maxWidth: number;
  isChildDraggingOver?: boolean;
  dropIndex?: number;
  /** 正在被拖拽的内部子元素 ID（用于显示半透明效果） */
  draggingChildId?: string;
  /** 被拖拽元素当前的位置（用于显示拖拽预览） */
  draggingPosition?: { x: number; y: number };
  /** 拖入占位块高度（isChildDraggingOver 时有效） */
  dropPlaceholderHeight?: number;
}

export const COLUMN_DEFAULTS = {
  width: 300,
  titleHeight: 52,
  padding: 8,
  gap: 8,
  minWidth: 200,
  maxWidth: 600,
  borderRadius: 6,
  /** 子元素槽位圆角 */
  slotRadius: 4,
  /** 空列占位框高度 */
  emptyHeight: 60,
  /** 顶部色带高度 */
  colorBandHeight: 3,
  /** 折叠态标题栏下露出的纸边高度（有子元素时） */
  collapsedStackHeight: 10,
  /** 外部元素拖入时占位块的高度范围（真实高度要落位后才能测出） */
  placeholderMinHeight: 40,
  placeholderMaxHeight: 240,
  /** 让位 / 落位动画 */
  animationDuration: 180,
  animationEasing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const COLUMN_COLOR_OPTIONS: Array<{ value: ColumnColor; label: string; token: string }> = [
  { value: "green", label: "绿", token: "var(--tau-tag-1)" },
  { value: "blue", label: "蓝", token: "var(--tau-tag-2)" },
  { value: "purple", label: "紫", token: "var(--tau-tag-3)" },
  { value: "yellow", label: "黄", token: "var(--tau-tag-4)" },
  { value: "red", label: "红", token: "var(--tau-tag-5)" },
];

/**
 * Column 配色：托盘与子元素槽位都是 surface 实底，靠发丝线分层，不用阴影。
 * 全部取自主题 token，随主题族与明暗切换。
 */
export const COLUMN_COLORS = {
  tray: "var(--tau-bg-surface)",
  trayDropOver: "color-mix(in srgb, var(--tau-bg-surface), var(--tau-accent) 4%)",
  line: "color-mix(in srgb, var(--tau-ink-1) 11%, transparent)",
  lineDropOver: "color-mix(in srgb, var(--tau-accent) 45%, transparent)",
  emptyLine: "color-mix(in srgb, var(--tau-ink-3) 45%, transparent)",
  placeholder: "color-mix(in srgb, var(--tau-ink-1) 6%, transparent)",
  dragShadow: "color-mix(in srgb, var(--tau-ink-1) 22%, transparent)",
  title: "var(--tau-ink-1)",
  muted: "var(--tau-ink-3)",
} as const;
