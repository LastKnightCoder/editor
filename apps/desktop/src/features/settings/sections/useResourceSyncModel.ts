/**
 * 资源文件同步的数据与动作 —— SyncSection 持有单例，下传给概览状态卡与资源文件 Tab
 * （sections/ResourceSync.tsx），避免重复订阅进度。
 */

import { useMemo } from "react";
import { toast } from "@tau/ui";
import useResourceSync from "@/hooks/useResourceSync";
import useResourceSyncBlacklist from "@/hooks/useResourceSyncBlacklist";
import { ResourceSyncStatus } from "@/types";
import type { IFileSyncStatus } from "@/types";

/** 展示顺序：失败 → 同步中 → 待同步 → 已同步，同级按文件名序 */
const FILE_STATUS_ORDER: Record<ResourceSyncStatus, number> = {
  [ResourceSyncStatus.Error]: 0,
  [ResourceSyncStatus.Syncing]: 1,
  [ResourceSyncStatus.Pending]: 2,
  [ResourceSyncStatus.Synced]: 3,
};

export type FileFilter = "all" | "upload" | "download" | "error";

export const pendingOf = (status: IFileSyncStatus, direction: "upload" | "download") =>
  status.syncDirection === direction && status.syncStatus !== ResourceSyncStatus.Synced;

export function useResourceSyncModel() {
  const sync = useResourceSync();
  const blacklist = useResourceSyncBlacklist();
  const { progress, statusFile } = sync;

  const isSyncing = progress.status === "syncing" || progress.status === "scanning";

  const entries = useMemo(
    () =>
      Object.entries(statusFile?.files ?? {}).sort(([aName, a], [bName, b]) => {
        const orderDiff = FILE_STATUS_ORDER[a.syncStatus] - FILE_STATUS_ORDER[b.syncStatus];
        return orderDiff !== 0 ? orderDiff : aName.localeCompare(bName);
      }),
    [statusFile]
  );

  const counts = useMemo(() => {
    const result: Record<FileFilter, number> = {
      all: entries.length,
      upload: 0,
      download: 0,
      error: 0,
    };
    entries.forEach(([, status]) => {
      if (pendingOf(status, "upload")) result.upload += 1;
      if (pendingOf(status, "download")) result.download += 1;
      if (status.syncStatus === ResourceSyncStatus.Error) result.error += 1;
    });
    return result;
  }, [entries]);

  const handleSync = async () => {
    const hasFailed = counts.error > 0;
    const res = hasFailed ? await sync.retryFailedSync() : await sync.startSync();
    if (res?.ok) {
      toast.success(hasFailed ? "已重新同步失败的资源文件" : "资源同步已启动");
    } else {
      toast.error(res?.message || "资源同步启动失败");
    }
  };

  const handleCancel = async () => {
    const res = await sync.cancelSync();
    if (res?.ok) toast.success("已停止资源同步");
    else toast.error(res?.message || "停止同步失败");
  };

  const handleRefresh = async () => {
    await Promise.all([sync.refreshStatuses(), sync.refreshProgress()]);
    toast.success("已刷新资源同步状态");
  };

  return {
    progress,
    statusFile,
    isSyncing,
    entries,
    counts,
    blacklist,
    handleSync,
    handleCancel,
    handleRefresh,
  };
}

export type ResourceSyncModel = ReturnType<typeof useResourceSyncModel>;
