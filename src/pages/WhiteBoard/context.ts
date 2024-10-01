import { createContext } from "react";
import { Board, Selection, ViewPort } from "./types";

export const BoardContext = createContext<Board | null>(null);
export const SelectionContext = createContext<Selection | null>(null);
export const ViewPortContext = createContext<ViewPort | null>(null);
