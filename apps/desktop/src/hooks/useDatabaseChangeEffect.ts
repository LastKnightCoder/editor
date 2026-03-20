import { useEffect, useRef } from "react";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useSettingStore from "@/stores/useSettingStore";

/**
 * 统一的数据库切换监听 Hook
 *
 * 用于监听数据库连接状态和数据库切换事件，并在状态变化时执行回调函数。
 *
 * @param callback - 当数据库连接或切换时执行的回调函数
 * @param deps - 额外的依赖项数组（可选）
 *
 * @example
 * ```tsx
 * // 基础用法
 * useDatabaseChangeEffect(() => {
 *   loadData();
 * });
 *
 * // 带额外依赖项
 * useDatabaseChangeEffect(() => {
 *   loadData(filter);
 * }, [filter]);
 * ```
 *
 * @remarks
 * - 只有在数据库连接成功后才会执行回调
 * - 数据库切换时会自动重新执行回调
 * - 使用 ref 确保回调始终是最新版本
 */
export const useDatabaseChangeEffect = (
  callback: () => void | Promise<void>,
  deps: React.DependencyList = [],
) => {
  const database = useSettingStore((state) => state.setting.database.active);
  const databaseStatus = useGlobalStateStore(
    (state) => state.databaseStatus[database],
  );
  const callbackRef = useRef(callback);

  // 保持回调函数的最新引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (database && databaseStatus === "ready") {
      const execute = async () => {
        await callbackRef.current();
      };
      execute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseStatus, database, ...deps]);
};
