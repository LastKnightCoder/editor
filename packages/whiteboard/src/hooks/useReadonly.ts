import { useSyncExternalStore } from "react";
import { useBoard } from "./useBoard";
import { useMemoizedFn } from "ahooks";

export const useReadonly = () => {
  const board = useBoard();

  const getSnapshot = useMemoizedFn(() => {
    return board.readonly;
  });

  const subscribe = useMemoizedFn((callback: () => void) => {
    board.on("readonlyChange", callback);
    return () => {
      board.off("readonlyChange", callback);
    };
  });
  return useSyncExternalStore(subscribe, getSnapshot);
};

export default useReadonly;
