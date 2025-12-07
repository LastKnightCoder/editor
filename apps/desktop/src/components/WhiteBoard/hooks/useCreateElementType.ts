import { useSyncExternalStore } from "react";
import { useMemoizedFn } from "ahooks";
import { useBoard } from "./useBoard";

export const useCreateElementType = () => {
  const board = useBoard();
  const getSnapshot = useMemoizedFn(() => {
    return board.currentCreateType;
  });

  const subscribe = useMemoizedFn((callback: () => void) => {
    board.on("onCurrentCreateTypeChange", callback);
    return () => {
      board.off("onCurrentCreateTypeChange", callback);
    };
  });

  return useSyncExternalStore(subscribe, getSnapshot);
};
