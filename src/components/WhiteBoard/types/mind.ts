import { Descendant } from "slate";

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
  background: string;
  border: string;
  textColor: string;
  defaultFocus?: boolean;
  isRightFold?: boolean;
  isLeftFold?: boolean;
}

export interface MindDragTarget {
  node: MindNodeElement;
  insertIndex?: number;
  direction: "left" | "right";
}
