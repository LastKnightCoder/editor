import { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type {
  ResourceSyncActionResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
} from "../types";
import * as tauri from "../services/tauri";

const POLL_INTERVAL_MS = 1000;

const EMPTY_RESOURCE_PROGRESS: ResourceSyncProgress = {
  totalFiles: 0,
  processedFiles: 0,
  currentFile: null,
  status: "idle",
  uploadCount: 0,
  downloadCount: 0,
  skippedCount: 0,
  errorCount: 0,
  startTime: null,
};

function isRunningStatus(status: ResourceSyncProgress["status"]): boolean {
  return status === "scanning" || status === "syncing";
}

export function useResourceSync() {
  const [progress, setProgress] = useState<ResourceSyncProgress>(EMPTY_RESOURCE_PROGRESS);
  const [statusFile, setStatusFile] = useState<ResourceSyncStatusFile | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useMemoizedFn(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  });

  const refreshResourceProgress = useMemoizedFn(async () => {
    const next = await tauri.resourceSyncGetProgress();
    setProgress(next);
    if (!isRunningStatus(next.status)) {
      stopPolling();
    }
    return next;
  });

  const refreshResourceStatus = useMemoizedFn(async () => {
    try {
      const status = await tauri.resourceSyncRefresh();
      setStatusFile(status);
      await refreshResourceProgress();
      return status;
    } catch (error) {
      console.error("刷新资源同步状态失败", error);
      const fallback = await tauri.resourceSyncGetStatus();
      setStatusFile(fallback);
      await refreshResourceProgress();
      return fallback;
    }
  });

  const startPolling = useMemoizedFn(() => {
    if (pollTimer.current) {
      return;
    }
    pollTimer.current = setInterval(() => {
      void (async () => {
        try {
          const next = await refreshResourceProgress();
          if (!isRunningStatus(next.status)) {
            stopPolling();
            await refreshResourceStatus();
          }
        } catch (error) {
          console.error("轮询资源同步进度失败", error);
          stopPolling();
        }
      })();
    }, POLL_INTERVAL_MS);
  });

  const startResourceSync = useMemoizedFn(async (): Promise<ResourceSyncActionResponse> => {
    const result = await tauri.resourceSyncStart();
    await refreshResourceProgress();
    if (result.ok) {
      startPolling();
    }
    return result;
  });

  const retryFailedResourceSync = useMemoizedFn(async (): Promise<ResourceSyncActionResponse> => {
    const result = await tauri.resourceSyncRetryFailed();
    await refreshResourceProgress();
    if (result.ok) {
      startPolling();
    }
    return result;
  });

  const cancelResourceSync = useMemoizedFn(async (): Promise<ResourceSyncActionResponse> => {
    const result = await tauri.resourceSyncCancel();
    await refreshResourceProgress();
    return result;
  });

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const isResourceSyncing = useMemo(() => isRunningStatus(progress.status), [progress.status]);

  // 返回值 memo 化：字段不变时引用稳定（函数均经 useMemoizedFn 稳定）
  return useMemo(
    () => ({
      progress,
      statusFile,
      isResourceSyncing,
      refreshResourceProgress,
      refreshResourceStatus,
      startResourceSync,
      retryFailedResourceSync,
      cancelResourceSync,
    }),
    [
      progress,
      statusFile,
      isResourceSyncing,
      refreshResourceProgress,
      refreshResourceStatus,
      startResourceSync,
      retryFailedResourceSync,
      cancelResourceSync,
    ]
  );
}
