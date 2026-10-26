import { useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { BootstrapResponse, DatabaseListResponse, SyncVersionResponse } from "../types";
import * as tauri from "../services/tauri";

export function useBootstrap() {
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [databases, setDatabases] = useState<DatabaseListResponse | null>(null);
  const [versions, setVersions] = useState<SyncVersionResponse | null>(null);

  const refreshDatabases = useMemoizedFn(async () => {
    const result = await tauri.listDatabases();
    setDatabases(result);
    return result;
  });

  const refreshVersions = useMemoizedFn(async () => {
    const result = await tauri.syncCheckVersions();
    setVersions(result);
    return result;
  });

  const initialize = useMemoizedFn(async () => {
    setIsLoading(true);
    try {
      const boot = await tauri.bootstrapApp();
      setBootstrap(boot);
      await refreshDatabases();
      try {
        await refreshVersions();
      } catch (error) {
        console.warn("[bootstrap] 启动时同步状态检查失败", error);
        setVersions(null);
      }
      return boot;
    } finally {
      setIsLoading(false);
    }
  });

  // 返回值 memo 化：字段不变时引用稳定，避免 AppContext 因新对象引用全量重渲染
  return useMemo(
    () => ({
      isLoading,
      bootstrap,
      databases,
      versions,
      initialize,
      refreshDatabases,
      refreshVersions,
      setVersions,
    }),
    [
      isLoading,
      bootstrap,
      databases,
      versions,
      initialize,
      refreshDatabases,
      refreshVersions,
      setVersions,
    ]
  );
}
