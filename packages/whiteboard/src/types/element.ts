import type { EntityRef } from "@tau/shared/entity-ref";
import type { ElementSketch } from "./sketch";
import type { Point } from "./point";

/** 白板持久化元素；不依赖 Board 或内部插件实例。 */
export interface BoardElement {
  id: string;
  type: string;
  name?: string;
  groupId?: string;
  children?: BoardElement[];
  resizable?: boolean;
  autoHeight?: boolean;
  entityRef?: EntityRef;
  sketch?: ElementSketch;
  schemaVersion?: number;
  [key: string]: any;
}

export interface ElementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BoardContextMenuPayload {
  clientX: number;
  clientY: number;
  viewPortPoint: Point;
  selectedElements: BoardElement[];
  hitElements: BoardElement[];
  targetElements: BoardElement[];
  hitElement?: BoardElement;
  isHitSelected: boolean;
}
