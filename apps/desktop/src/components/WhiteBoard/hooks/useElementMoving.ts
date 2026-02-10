import { useSyncExternalStore } from "react";
import { useBoardState } from "./useBoardState";

export const useElementMoving = (elementId: string) => {
  const { movingStore } = useBoardState();

  return useSyncExternalStore(movingStore.subscribe, () =>
    movingStore.getElementMoving(elementId),
  );
};
