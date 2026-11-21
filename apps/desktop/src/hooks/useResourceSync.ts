import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  cancelResourceSync,
  getResourceSyncSnapshot,
  refreshResourceSyncStatuses,
  retryFailedResourceSync,
  startResourceSync,
} from "@/commands";
import type { IResourceSyncProgress, ResourceSyncOptions } from "@/types";
import useSettingStore, { ESync } from "@/stores/useSettingStore";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";

const emptyProgress: IResourceSyncProgress = {
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

type Action = "sync" | "retry" | "refresh";

export default function useResourceSync() {
  const client = useBackendWebsocketStore(state => state.client);
  const sync = useSettingStore(state => state.setting.sync);
  const id = sync.active === ESync.Plugin ? sync.plugin?.id : undefined;
  const config = id ? sync.plugin?.configurations[id] : undefined;
  // 查询按配置实例隔离，避免把服务密钥写入查询键。
  const { options, queryId } = useMemo(
    () => ({
      options:
        id && config !== undefined
          ? ({ provider: "plugin", pluginId: id, config } satisfies ResourceSyncOptions)
          : null,
      queryId: crypto.randomUUID(),
    }),
    [id, config]
  );
  const lock = useRef(false);
  const [action, setAction] = useState<Action | null>(null);
  const [stopping, setStopping] = useState(false);
  const { data, refetch, error } = useQuery({
    queryKey: ["settings", "resource-sync", queryId],
    gcTime: 0,
    enabled: !!options,
    queryFn: () => {
      if (!options) throw new Error("同步配置不完整");
      return getResourceSyncSnapshot(options);
    },
    refetchInterval: query => {
      const phase = query.state.data?.progress.status;
      return action || phase === "checking" || phase === "scanning" || phase === "syncing"
        ? 500
        : false;
    },
    retry: false,
  });

  // 其他窗口启动或结束时唤醒此页；传输中按固定频率合并读取进度和文件状态。
  useEffect(() => {
    if (!client || !options) return;
    const onProgress = () => {
      void refetch();
    };
    client.registerNotificationHandler("resource-sync:progress-update", onProgress);
    return () => client.unregisterNotificationHandler("resource-sync:progress-update", onProgress);
  }, [client, options, refetch]);

  const run = async (next: Action, fileName?: string) => {
    if (!options || lock.current) return;
    lock.current = true;
    setAction(next);
    setStopping(false);
    try {
      if (next === "refresh") {
        await refreshResourceSyncStatuses(options);
      } else {
        const result = await (next === "retry"
          ? retryFailedResourceSync(options, fileName)
          : startResourceSync(options));
        if (!result.ok && !result.cancelled) throw new Error(result.message || "资源同步失败");
      }
    } finally {
      try {
        await refetch({ throwOnError: true });
      } finally {
        lock.current = false;
        setAction(null);
        setStopping(false);
      }
    }
  };

  const cancel = async () => {
    setStopping(true);
    try {
      const result = await cancelResourceSync();
      if (!result.ok) throw new Error(result.message || "停止同步失败");
    } catch (error) {
      setStopping(false);
      throw error;
    }
  };

  const progress = data?.progress ?? emptyProgress;
  const submitting = action === "sync" || action === "retry";
  return {
    progress,
    statusFile: data?.statusFile,
    error,
    submitting,
    refreshing: action === "refresh" || progress.status === "checking",
    stopping:
      stopping && (submitting || progress.status === "scanning" || progress.status === "syncing"),
    run,
    cancel,
  };
}
