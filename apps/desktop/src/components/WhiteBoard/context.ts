import { createContext } from "react";
import type { RefObject } from "react";
import { Board, Point, Selection, ViewPort } from "./types";
import { MovingElementsStore } from "./hooks/useElementsMoving";

export const BoardContext = createContext<Board | null>(null);
export const SelectionContext = createContext<Selection | null>(null);
export const ViewPortContext = createContext<ViewPort>({
  minX: 0,
  minY: 0,
  width: 0,
  height: 0,
  zoom: 1,
});

export const BoardStateContext = createContext<{
  isMoving: boolean;
  movingStore: MovingElementsStore;
  simplifiedRenderZoomThreshold: number;
}>({
  isMoving: false,
  movingStore: {
    subscribe: () => () => {},
    getBoardMoving: () => false,
    getElementMoving: () => false,
  },
  simplifiedRenderZoomThreshold: 0.3,
});

export const ArrowConnectPointOverlayContext =
  createContext<RefObject<SVGGElement | null> | null>(null);

export const PointerViewportPositionContext =
  createContext<RefObject<Point | null> | null>(null);
