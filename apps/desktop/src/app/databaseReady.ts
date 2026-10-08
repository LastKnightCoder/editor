/**
 * 数据库就绪保障 —— 新壳层的数据前置步骤。
 *
 * 与旧 ContentLayout 的 useInitDatabase 同源逻辑（不依赖 antd message）：
 * setting.database.active（persist）里是当前数据库名，connectDatabaseByName
 * 连接后主进程命令才有数据库上下文（否则报 "No database name found"）。
 *
 * 壳层按活动数据库重建；连接状态供页面查询控制启用时机。
 */

import { connectDatabaseByName } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import { queryClient } from "@/queryClient";

const CONNECT_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`数据库连接超时（${ms}ms）`)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      reason => {
        clearTimeout(timer);
        reject(reason);
      }
    );
  });
}

export async function ensureDatabaseReady(onError?: (message: string) => void): Promise<boolean> {
  const { inited } = useSettingStore.getState();
  const active = useSettingStore.getState().setting.database.active;
  if (!inited || !active) {
    console.warn("[shell] 未找到已初始化的数据库配置，数据命令将不可用");
    return false;
  }
  try {
    useGlobalStateStore.setState(state => ({
      databaseStatus: { ...state.databaseStatus, [active]: "connecting" },
    }));
    await withTimeout(connectDatabaseByName(active), CONNECT_TIMEOUT_MS);
    if (useSettingStore.getState().setting.database.active !== active) return false;
    // 页面栈重建不会清除全局查询；开放新库页面前移除旧缓存并取消其在途查询。
    queryClient.getQueryCache().clear();
    useGlobalStateStore.setState(state => ({
      databaseStatus: { ...state.databaseStatus, [active]: "ready" },
    }));
    return true;
  } catch (e) {
    onError?.(e instanceof Error ? e.message : String(e));
    useGlobalStateStore.setState(state => ({
      databaseStatus: { ...state.databaseStatus, [active]: "error" },
    }));
    console.warn("[shell] 数据库连接失败：", e);
    return false;
  }
}
