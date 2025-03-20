import { useContext } from "react";
import { useStore } from "zustand";
import { TableContext, TableStoreType } from "../TableContext";
import { useMemoizedFn } from "ahooks";

/**
 * 使用表格状态的自定义Hook
 * 在任何子组件中使用这个Hook来访问表格状态和操作
 *
 * 支持选择器，可以只订阅特定的状态片段，当该片段变化时组件才会重新渲染
 *
 * @example
 * // 使用整个store
 * const store = useTableStore();
 *
 * @example
 * // 只订阅rows
 * const rows = useTableStore(state => state.rows);
 *
 * @param selector 可选的选择器函数，用于提取需要的状态片段
 * @returns 状态或状态的片段
 */
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
