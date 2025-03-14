import { BoardElement } from "./board";
import { Point } from "./point";

export interface SelectArea {
  anchor: Point;
  focus: Point;
}

export interface Selection {
  selectArea: SelectArea | null;
  selectedElements: BoardElement[];
  [key: string]: any;
}
