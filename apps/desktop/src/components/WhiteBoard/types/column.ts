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
  titleHeight: 76,
  padding: 16,
  gap: 8,
  minWidth: 200,
  maxWidth: 600,
  backgroundColor: "#ffffff",
  borderRadius: 12,
  shadowEnabled: true,
} as const;

/**
 * Column 主题色板（贴近 Milanote 的冷白半透明基调）
 * 容器退让、靠圆角+柔和投影浮起，强调色克制为单一柔和蓝
 */
export const columnTheme = {
  light: {
    backgroundColor: "rgba(248, 250, 252, 0.88)",
    border: "rgba(15, 23, 42, 0.06)",
    titleText: "rgba(15, 23, 42, 0.85)",
    descriptionText: "rgba(15, 23, 42, 0.45)",
    separator: "rgba(15, 23, 42, 0.05)",
    shadow:
      "drop-shadow(0 6px 16px rgba(15,23,42,0.08)) drop-shadow(0 1px 3px rgba(15,23,42,0.05))",
    dropHighlightFill: "rgba(59, 130, 246, 0.06)",
    dropHighlightBorder: "rgba(59, 130, 246, 0.4)",
    dropIndicator: "#3b82f6",
    dragPreviewStroke: "rgba(59, 130, 246, 0.5)",
  },
  dark: {
    backgroundColor: "rgba(30, 35, 45, 0.85)",
    border: "rgba(255, 255, 255, 0.08)",
    titleText: "rgba(241, 245, 249, 0.9)",
    descriptionText: "rgba(241, 245, 249, 0.4)",
    separator: "rgba(255, 255, 255, 0.06)",
    shadow:
      "drop-shadow(0 6px 16px rgba(0,0,0,0.35)) drop-shadow(0 1px 3px rgba(0,0,0,0.2))",
    dropHighlightFill: "rgba(59, 130, 246, 0.1)",
    dropHighlightBorder: "rgba(96, 165, 250, 0.4)",
    dropIndicator: "#60a5fa",
    dragPreviewStroke: "rgba(96, 165, 250, 0.5)",
  },
} as const;

export const COLUMN_ALLOWED_CHILDREN = [
  "richtext",
  "card",
  "image",
  "video",
  "audio",
  "whiteboard",
] as const;

export type ColumnAllowedChildType = (typeof COLUMN_ALLOWED_CHILDREN)[number];
