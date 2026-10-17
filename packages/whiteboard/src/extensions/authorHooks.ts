import { useSyncExternalStore } from "react";
import { useWhiteboardAPI } from "./context";
import type { BoardElement } from "../types/element";
import { DEFAULT_PAGE_SKETCH } from "../types/sketch";

export function usePageSketch() {
  const api = useWhiteboardAPI();
  const snapshot = () => api.getSnapshot().sketch ?? DEFAULT_PAGE_SKETCH;
  return useSyncExternalStore(api.subscribe, snapshot, snapshot);
}

/** 订阅所属画布的画风，元素和 owner 的覆盖仍由内核统一解析。 */
export function useSketch(element: BoardElement, owner?: BoardElement) {
  const api = useWhiteboardAPI();
  const snapshot = () => api.getSnapshot().sketch;
  useSyncExternalStore(api.subscribe, snapshot, snapshot);
  return api.getSketch(element, owner);
}
