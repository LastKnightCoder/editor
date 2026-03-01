import { useContext, useSyncExternalStore } from "react";
import { useMemoizedFn } from "ahooks";
import { PointerViewportStoreContext } from "../context";

export const usePointerViewport = () => {
  const store = useContext(PointerViewportStoreContext);

  const subscribe = useMemoizedFn((listener: () => void) => {
    if (!store) return () => {};
    return store.subscribe(listener);
  });

  const getSnapshot = useMemoizedFn(() => {
    if (!store) return null;
    return store.getSnapshot();
  });

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
};

export default usePointerViewport;
