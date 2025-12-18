import { BoardElement } from "./board";
import { CommonElement } from "../plugins/CommonPlugin";

export interface ColumnElement extends CommonElement {
  type: "column";
  title: string;
  children: BoardElement[];
  padding: number;
  gap: number;
  backgroundColor: string;
  borderRadius: number;
  shadowEnabled: boolean;
  minWidth: number;
  maxWidth: number;
  isChildDraggingOver?: boolean;
  dropIndex?: number;
  /** 正在被拖拽的内部子元素 ID（用于显示半透明效果） */
  draggingChildId?: string;
  /** 被拖拽元素当前的位置（用于显示拖拽预览） */
  draggingPosition?: { x: number; y: number };
}

export interface ColumnStyle {
  backgroundColor: string;
  borderRadius: number;
  shadowEnabled: boolean;
}

export const COLUMN_DEFAULTS = {
  width: 300,
  titleHeight: 56,
  padding: 16,
  gap: 8,
  minWidth: 200,
  maxWidth: 600,
  backgroundColor: "#ffffff",
  borderRadius: 0,
  shadowEnabled: false,
} as const;

export const COLUMN_ALLOWED_CHILDREN = [
  "richtext",
  "card",
  "image",
  "video",
  "whiteboard",
] as const;

export type ColumnAllowedChildType = (typeof COLUMN_ALLOWED_CHILDREN)[number];
