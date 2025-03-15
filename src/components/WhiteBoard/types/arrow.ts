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
  lineColor: string;
  lineWidth: number;
  sketchEnabled?: boolean;
  roughness?: number;
}

export interface GetArrowPathParams {
  lineType: EArrowLineType;
  points: Point[];
  sourceMarker: EMarkerType;
  targetMarker: EMarkerType;
  sourceConnectId?: string;
  targetConnectId?: string;
}
