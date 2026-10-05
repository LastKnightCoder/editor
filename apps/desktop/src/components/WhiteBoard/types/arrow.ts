import { BoardElement } from "./board";
import { Point } from "./point";
import { Descendant } from "slate";

export enum EArrowLineType {
  STRAIGHT = "straight",
  CURVE = "curve",
  ORTHOGONAL = "orthogonal",
}

export enum EMarkerType {
  None = "none",
  Arrow = "arrow",
  OpenArrow = "open-arrow",
  ClosedArrow = "closed-arrow",
  Diamond = "diamond",
  Circle = "circle",
}

// 自定义连接点的相对坐标：u、v ∈ [0,1]，分别相对绑定图形 bbox 的宽高比例。
// 这样图形移动/缩放时，连接点坐标可由 bbox 重算，与 5 个固定点统一为 uv 常量。
export interface CustomOffset {
  u: number;
  v: number;
}

export interface ArrowBound {
  marker: EMarkerType;
  connectId?: string;
  bindId?: string;
  // 仅当 connectId === "custom" 时有效，记录自定义连接点在绑定图形 bbox 上的相对位置
  customOffset?: CustomOffset;
}

export interface ArrowElement extends BoardElement {
  type: "arrow";
  lineType: EArrowLineType;
  source: ArrowBound;
  target: ArrowBound;
  points: Point[];
  lineWidth: number;
  dashed?: boolean;
  dashArray?: number[];
  animated?: boolean;
  animationSpeed?: number; // 流动速度，1-10
  midPoint?: Point; // 曲线通过的中间点（用户可拖动，显示为蓝色圆圈）
  description?: Descendant[];
  // 主题颜色ID（自动适配深浅色模式）
  themeColorId?: string;
}

export interface GetArrowPathParams {
  lineType: EArrowLineType;
  points: Point[];
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  sourceConnectId?: string;
  targetConnectId?: string;
  sourceCustomOffset?: CustomOffset;
  targetCustomOffset?: CustomOffset;
  midPoint?: Point; // 曲线通过的中间点
}
