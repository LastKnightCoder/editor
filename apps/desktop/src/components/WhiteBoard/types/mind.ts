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
  themeId?: string;
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
