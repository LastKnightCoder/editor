import { useMemo } from "react";
import { toast } from "@tau/ui";
import useResourceSync from "@/hooks/useResourceSync";
import useResourceSyncBlacklist from "@/hooks/useResourceSyncBlacklist";
import { ResourceSyncStatus } from "@/types";

const FILE_STATUS_ORDER: Record<ResourceSyncStatus, number> = {
  [ResourceSyncStatus.Syncing]: 0,
  [ResourceSyncStatus.Error]: 1,
  [ResourceSyncStatus.Synced]: 2,
  [ResourceSyncStatus.Pending]: 3,
};

export type FileFilter = "all" | "upload" | "download" | "error";

export function useResourceSyncModel() {
  const sync = useResourceSync();
  const blacklist = useResourceSyncBlacklist();
  const { progress, statusFile } = sync;
  const isSyncing =
    sync.submitting || progress.status === "scanning" || progress.status === "syncing";
  const entries = useMemo(
    () =>
      Object.entries(statusFile?.files ?? {}).sort(([aName, a], [bName, b]) => {
        const orderDiff = FILE_STATUS_ORDER[a.syncStatus] - FILE_STATUS_ORDER[b.syncStatus];
        return orderDiff || aName.localeCompare(bName);
      }),
    [statusFile]
  );
  const counts = useMemo(() => {
    const result = {
      all: entries.length,
      upload: 0,
      download: 0,
      error: 0,
      skipped: 0,
      pending: 0,
      uploaded: 0,
      downloaded: 0,
    };
    for (const [, file] of entries) {
      if (file.syncDirection) result[file.syncDirection]++;
      else if (file.syncStatus === ResourceSyncStatus.Synced) result.skipped++;
      if (file.syncStatus === ResourceSyncStatus.Synced && file.syncDirection) {
        if (file.syncDirection === "upload") result.uploaded++;
        else result.downloaded++;
      }
      if (file.syncStatus === ResourceSyncStatus.Error) result.error++;
      if (file.syncStatus === ResourceSyncStatus.Pending) result.pending++;
    }
    return result;
  }, [entries]);
  const reportError = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : String(error));

  return {
    progress,
    statusFile,
    entries,
    counts,
    blacklist,
    isSyncing,
    refreshing: sync.refreshing,
    stopping: sync.stopping,
    readError: sync.error?.message,
    handleSync: (fileName?: string) =>
      sync.run(counts.error ? "retry" : "sync", fileName).catch(reportError),
    handleCancel: () => sync.cancel().catch(reportError),
    handleRefresh: () => sync.run("refresh").catch(reportError),
  };
}

export type ResourceSyncModel = ReturnType<typeof useResourceSyncModel>;
