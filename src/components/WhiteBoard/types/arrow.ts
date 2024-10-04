import { BoardElement } from "./board";
import { Point } from "./point";

export enum EArrowLineType {
  STRAIGHT = 'straight',
  CURVE = 'curve',
}

export enum EMarkerType {
  None = 'none',
  Arrow = 'arrow',
}

export interface ArrowBound {
  marker: EMarkerType;
  connectId?: string;
  bindId?: string;
}

export interface ArrowElement extends BoardElement {
  type: 'arrow';
  lineType: EArrowLineType;
  source: ArrowBound;
  target: ArrowBound;
  points: Point[];
  lineColor: string;
  lineWidth: number;
}