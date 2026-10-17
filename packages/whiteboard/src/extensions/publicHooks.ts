import { useSyncExternalStore } from "react";
import { useWhiteboardAPI } from "./context";

export function useSelection() {
  const api = useWhiteboardAPI();
  return useSyncExternalStore(api.subscribe, api.getSnapshot).selection;
}
export function useViewPort() {
  const api = useWhiteboardAPI();
  return useSyncExternalStore(api.subscribe, api.getSnapshot).viewPort;
}
