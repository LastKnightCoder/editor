import { BoardElement } from "./board";
import { CommonElement } from "../plugins/CommonPlugin";

export const FRAME_TITLE_HEIGHT = 40;
export const FRAME_TITLE_GAP = 10;

export type FrameTitlePosition = "top" | "inline";

export const FRAME_DEFAULT_TITLE_POSITION: FrameTitlePosition = "top";

export type FrameBorderStyle = "solid" | "dashed" | "dotted";

export const FRAME_DEFAULT_BORDER_STYLE: FrameBorderStyle = "solid";

export const FRAME_INLINE_TITLE_HEIGHT = 32;

export interface FrameElement extends CommonElement {
  type: "frame";
  title: string;
  titlePosition?: FrameTitlePosition;
  children: BoardElement[];
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  /** 边框线型，缺省为实线 */
  borderStyle?: FrameBorderStyle;
  padding: number;
  containmentPolicy: "full" | "partial";
  removalPolicy: "full" | "partial";
  autoResize: boolean;
  minWidth: number;
  minHeight: number;
  isChildMoveIn?: boolean;
}

export interface FrameStyle {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
}

export const FRAME_DEFAULT_STYLES: FrameStyle[] = [
  {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "#3b82f6",
    borderWidth: 2,
    borderRadius: 8,
  },
  {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "#10b981",
    borderWidth: 2,
    borderRadius: 8,
  },
  {
    backgroundColor: "rgba(253, 224, 71, 0.15)",
    borderColor: "#fde047",
    borderWidth: 2,
    borderRadius: 8,
  },
  {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "#f59e0b",
    borderWidth: 2,
    borderRadius: 8,
  },
  {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "#ef4444",
    borderWidth: 2,
    borderRadius: 8,
  },
  {
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderColor: "#8b5cf6",
    borderWidth: 2,
    borderRadius: 8,
  },
  {
    backgroundColor: "rgba(107, 114, 128, 0.1)",
    borderColor: "#6b7280",
    borderWidth: 2,
    borderRadius: 8,
  },
];
