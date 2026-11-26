import { Descendant } from "slate";
import type { Point } from "./point";

export interface MindNodeElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  // 节点的高度
  height: number;
  // 实际占据的高度
  actualHeight: number;
  level: number;
  children: MindNodeElement[];
  childrenHeight: number;
  leftChildrenHeight: number;
  rightChildrenHeight: number;
  direction: "left" | "right";
  text: Descendant[];
  background?: string;
  border?: string;
  textColor?: string;
  defaultFocus?: boolean;
  isRightFold?: boolean;
  isLeftFold?: boolean;
  theme?: "light" | "dark";
  contentId?: number;
  contentTitle?: string;
  /** 导图配色（只在根节点上），见 constants/mind-themes */
  themeId?: string;
  /** 节点风格：solid / soft / outline（只在根节点上） */
  themeStyle?: string;
  /** 布局：mind / logic / org / tree（只在根节点上），缺省为 mind，见 utils/mind-layout */
  layout?: string;
  /** 本节点为概要：括住父节点下 [startId, endId] 这段兄弟（不含其他概要） */
  summaryRange?: MindRange;
  /** 外框：各括住本节点下 [startId, endId] 这段子节点 */
  boundaries?: MindBoundary[];
}

export interface MindRange {
  startId: string;
  endId: string;
}

export interface MindBoundary extends MindRange {
  id: string;
  title?: string;
}

export interface MindDragTarget {
  node: MindNodeElement;
  insertIndex: number;
  direction: "left" | "right";
  horizontalDistance: number;
  verticalDistance: number;
  score: number;
  connectionStart: Point;
  connectionEnd: Point;
  /** 预览连线两端的切线方向，缺省水平 */
  connectionAxis?: "x" | "y";
}

export interface MindDragState {
  mode: "preview" | "root-translate" | null;
  isDragging: boolean;
  draggedNode: MindNodeElement | null;
  sourceRootId: string | null;
  originalParentId: string | null;
  startPoint: Point | null;
  dragOffset: Point;
  previewNode: MindNodeElement | null;
  currentTarget: MindDragTarget | null;
  connectionLineColor: string | null;
  pointerId: number | null;
}
