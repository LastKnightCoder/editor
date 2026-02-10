import { useSyncExternalStore } from "react";
import { useBoardState } from "./useBoardState";

export const useBoardMoving = () => {
  const { movingStore } = useBoardState();

  return useSyncExternalStore(
    movingStore.subscribe,
    movingStore.getBoardMoving,
  );
};
