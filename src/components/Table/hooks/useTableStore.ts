import { useContext } from "react";
import { useStore } from "zustand";
import { TableContext, TableStoreType } from "../TableContext";
import { useMemoizedFn } from "ahooks";

export function useTableStore<T = TableStoreType>(
  selector?: (state: ReturnType<TableStoreType["getState"]>) => T,
): T {
  const store = useContext(TableContext);

  if (!store) {
    throw new Error(
      "useTableStore must be used within a TableContext.Provider",
    );
  }

  const defaultSelector = useMemoizedFn(() => store as unknown as T);

  // 使用默认选择器，避免条件调用Hook
  return useStore(store, selector || defaultSelector);
}

export default useTableStore;
