import { useSyncExternalStore } from "react";
import { useBoard } from "./useBoard";
import MindPlugin from "../plugins/MindPlugin";

export function useDragState() {
  const board = useBoard();

  const plugin = board.getPlugin("mind-node") as MindPlugin;

  return useSyncExternalStore(
    plugin.subscribe.bind(plugin),
    plugin.getSnapshot.bind(plugin),
  );
}
