import { createContext } from "react";
import { Board, Selection, ViewPort } from "./types";

export const BoardContext = createContext<Board | null>(null);
export const SelectionContext = createContext<Selection | null>(null);
export const ViewPortContext = createContext<ViewPort>({
  minX: 0,
  minY: 0,
  width: 0,
  height: 0,
  zoom: 1
});
