import { useContext, useSyncExternalStore } from "react";
import { SelectionContext, SelectionStore } from "../context";

const subscribeNone = () => () => undefined;

export function useSelection() {
  const value = useContext(SelectionContext);
  const read = value instanceof SelectionStore ? value.getSnapshot : () => value;
  return useSyncExternalStore(
    value instanceof SelectionStore ? value.subscribe : subscribeNone,
    read,
    read
  );
}
