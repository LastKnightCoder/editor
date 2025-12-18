import { BoardElement } from "./board";
import { Point } from "./point";

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

export interface ArrowBound {
  marker: EMarkerType;
  connectId?: string;
  bindId?: string;
}

export interface ArrowElement extends BoardElement {
  type: "arrow";
  lineType: EArrowLineType;
  source: ArrowBound;
  target: ArrowBound;
  points: Point[];
  lineWidth: number;
  sketchEnabled?: boolean;
  roughness?: number;
  dashed?: boolean;
  dashArray?: number[];
  animated?: boolean;
  animationSpeed?: number; // 流动速度，1-10
  midPoint?: Point; // 曲线通过的中间点（用户可拖动，显示为蓝色圆圈）
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
  midPoint?: Point; // 曲线通过的中间点
}
