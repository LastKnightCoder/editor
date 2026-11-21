import { useSyncExternalStore } from "react";
import { useBoard } from "./useBoard";

export const useViewPort = () => {
  const board = useBoard();
  return useSyncExternalStore(board.subscribe, () => board.viewPort);
};
