import { useSyncExternalStore } from "react";
import { useMemoizedFn } from "ahooks";
import { useBoard } from "./useBoard";

export const useActiveTool = () => {
  const board = useBoard();
  const getSnapshot = useMemoizedFn(() => {
    return board.activeTool;
  });

  const subscribe = useMemoizedFn((callback: () => void) => {
    board.on("active-tool:change", callback);
    return () => {
      board.off("active-tool:change", callback);
    };
  });

  return useSyncExternalStore(subscribe, getSnapshot);
};
