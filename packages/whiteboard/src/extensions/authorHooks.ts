import { useSyncExternalStore } from "react";
import { useWhiteboardAPI } from "./context";
import type { BoardElement } from "../types/element";

/** 订阅所属画布的画风，元素和 owner 的覆盖仍由内核统一解析。 */
export function useSketch(element: BoardElement, owner?: BoardElement) {
  const api = useWhiteboardAPI();
  useSyncExternalStore(api.subscribe, () => api.getSnapshot().sketch);
  return api.getSketch(element, owner);
}
