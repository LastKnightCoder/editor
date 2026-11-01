import { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type {
  ResourceSyncActionResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
} from "../types";
import * as tauri from "../services/tauri";
import { getMobileSettingSnapshot } from "../services/mobileSettingsBridge";
import { waitForMobilePluginReady } from "../app/plugins/content";
import { resolveSyncErrorMessage } from "../features/settings/sync/syncErrors";

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
  const polling = useRef(false);
  const starting = useRef(false);
  const pendingStart = useRef<AbortController | null>(null);
  const statusRefresh = useRef<{
    setting: ReturnType<typeof getMobileSettingSnapshot>;
    task: Promise<ResourceSyncStatusFile | null>;
  } | null>(null);

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

  const recordError = useMemoizedFn((error: unknown) => {
    setProgress(previous => ({
      ...previous,
      status: "error",
      currentFile: null,
      errorMessage: resolveSyncErrorMessage(error, "资源同步失败，请重试"),
    }));
  });

  const refreshResourceStatus = useMemoizedFn(() => {
    if (starting.current || pollTimer.current) return Promise.resolve(statusFile);
    const setting = getMobileSettingSnapshot();
    if (statusRefresh.current?.setting === setting) return statusRefresh.current.task;
    const task = (async () => {
      try {
        const status = await tauri.resourceSyncRefresh();
        const next = await tauri.resourceSyncGetProgress();
        if (getMobileSettingSnapshot() === setting && !starting.current && !pollTimer.current) {
          setStatusFile(status);
          setProgress(next);
          if (isRunningStatus(next.status)) startPolling();
        }
        return status;
      } catch (error) {
        if (getMobileSettingSnapshot() === setting && !starting.current && !pollTimer.current) {
          recordError(error);
        }
        throw error;
      }
    })();
    const request = { setting, task };
    statusRefresh.current = request;
    void task
      .finally(() => {
        if (statusRefresh.current === request) statusRefresh.current = null;
      })
      .catch(() => undefined);
    return task;
  });

  const startPolling = useMemoizedFn(() => {
    if (pollTimer.current) {
      return;
    }
    pollTimer.current = setInterval(() => {
      if (polling.current) return;
      polling.current = true;
      void (async () => {
        try {
          const next = await refreshResourceProgress();
          // 读取本轮账本；再次比对云端会抹掉完成、停止和失败状态。
          const status = await tauri.resourceSyncGetStatus();
          setStatusFile(status);
          if (!isRunningStatus(next.status)) {
            stopPolling();
          }
        } catch (error) {
          recordError(error);
          stopPolling();
        } finally {
          polling.current = false;
        }
      })();
    }, POLL_INTERVAL_MS);
  });

  const runResourceSync = useMemoizedFn(
    async (retry: boolean): Promise<ResourceSyncActionResponse> => {
      if (starting.current) throw new Error("RESOURCE_SYNC_ALREADY_RUNNING:资源同步正在准备中");
      if (pollTimer.current) return { ok: true, message: "资源同步正在进行中" };
      starting.current = true;
      const controller = new AbortController();
      pendingStart.current = controller;
      const setting = getMobileSettingSnapshot();
      setProgress({ ...EMPTY_RESOURCE_PROGRESS, status: "scanning" });
      try {
        await waitForMobilePluginReady(controller.signal);
        pendingStart.current = null;
        if (getMobileSettingSnapshot() !== setting) {
          throw new Error("SYNC_PROVIDER_UNAVAILABLE:同步设置已改变，请重新同步资源文件");
        }
        const result = await (retry ? tauri.resourceSyncRetryFailed() : tauri.resourceSyncStart());
        if (!result.ok)
          throw new Error(`${result.code ?? "RESOURCE_SYNC_FAILED"}:${result.message}`);
        await refreshResourceProgress();
        setStatusFile(await tauri.resourceSyncGetStatus());
        startPolling();
        return result;
      } catch (error) {
        if (controller.signal.aborted) return { ok: true, message: "资源同步已停止" };
        recordError(error);
        throw error;
      } finally {
        starting.current = false;
        pendingStart.current = null;
      }
    }
  );

  const startResourceSync = useMemoizedFn(() => runResourceSync(false));
  const retryFailedResourceSync = useMemoizedFn(() => runResourceSync(true));

  const cancelResourceSync = useMemoizedFn(async (): Promise<ResourceSyncActionResponse> => {
    if (pendingStart.current) {
      pendingStart.current.abort();
      setProgress(previous => ({ ...previous, status: "cancelled", errorMessage: null }));
      return { ok: true, message: "资源同步已停止" };
    }
    const result = await tauri.resourceSyncCancel();
    await refreshResourceProgress();
    return result;
  });

  useEffect(() => {
    return () => {
      stopPolling();
      pendingStart.current?.abort();
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
