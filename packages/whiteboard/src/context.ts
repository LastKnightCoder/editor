import { createContext } from "react";
import type { RefObject } from "react";
import { Board, Point, Selection, ViewPort } from "./types";
import { MovingElementsStore } from "./hooks/useElementsMoving";
import type { ConnectPointOwnerStore } from "./utils/ConnectPointOwner";

export interface PointerViewportStore {
  getSnapshot: () => Point | null;
  subscribe: (listener: () => void) => () => void;
  setPoint: (point: Point | null) => void;
}

export const BoardContext = createContext<Board | null>(null);
export const SelectionContext = createContext<Selection | null>(null);
/** 静态元素层（选中的箭头/内部连接元素已提升到交互层时）强制无选区；元素级选中订阅据此短路 */
export const StaticSelectionContext = createContext(false);
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
  /** 连接点归属仲裁：同一时刻只有一个元素显示悬停连接点 */
  connectPointOwnerStore: ConnectPointOwnerStore | null;
}>({
  isMoving: false,
  movingStore: {
    subscribe: () => () => {},
    getBoardMoving: () => false,
    getElementMoving: () => false,
  },
  simplifiedRenderZoomThreshold: 0.3,
  connectPointOwnerStore: null,
});

export const ArrowConnectPointOverlayContext = createContext<RefObject<SVGGElement | null> | null>(
  null
);

export const PointerViewportStoreContext = createContext<PointerViewportStore | null>(null);
