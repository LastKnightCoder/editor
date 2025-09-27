import { useContext } from "react";
import { useStore } from "zustand";
import { DatabaseContext, DatabaseStoreType } from "../DatabaseContext";
import { useMemoizedFn } from "ahooks";

export function useDatabaseStore<T = DatabaseStoreType>(
  selector?: (state: ReturnType<DatabaseStoreType["getState"]>) => T,
): T {
  const store = useContext(DatabaseContext);

  if (!store) {
    throw new Error(
      "useDatabaseStore must be used within a DatabaseContext.Provider",
    );
  }

  const defaultSelector = useMemoizedFn(() => store as unknown as T);

  // 使用默认选择器，避免条件调用Hook
  return useStore(store, selector || defaultSelector);
}

export default useDatabaseStore;
