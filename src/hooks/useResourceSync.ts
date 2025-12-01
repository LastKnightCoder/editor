import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import {
  cancelResourceSync,
  getResourceSyncProgress,
  getResourceSyncStatuses,
  refreshResourceSyncStatuses,
  retryFailedResourceSync,
  resumeResourceSync,
  startResourceSync,
} from "@/commands";
import {
  IResourceSyncProgress,
  ISyncStatusFile,
  ResourceSyncOptions,
} from "@/types";
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

const useResourceSync = () => {
  const { client } = useBackendWebsocketStore((state) => ({
    client: state.client,
  }));
  const { syncConfig, integrationConfig } = useSettingStore((state) => ({
    syncConfig: state.setting.sync,
    integrationConfig: state.setting.integration,
  }));
  const [progress, setProgress] =
    useState<IResourceSyncProgress>(emptyProgress);
  const [statusFile, setStatusFile] = useState<ISyncStatusFile | null>(null);

  const buildOptions = useMemoizedFn((): ResourceSyncOptions | null => {
    switch (syncConfig.active) {
      case ESync.AliOSS: {
        const { accessKeyId, accessKeySecret } = integrationConfig.aliOSS;
        const { bucket, region, path } = syncConfig.aliOSS;
        if (!accessKeyId || !accessKeySecret || !bucket || !region) {
          return null;
        }
        return {
          provider: "alioss",
          accessKeyId,
          accessKeySecret,
          bucket,
          region,
          path: path || "/",
        };
      }
      case ESync.S3: {
        const { accessKeyId, secretAccessKey, endpoint, urlStyle } =
          integrationConfig.s3;
        const { bucket, region, pathPrefix } = syncConfig.s3;
        if (!accessKeyId || !secretAccessKey || !bucket || !region) {
          return null;
        }
        return {
          provider: "s3",
          accessKeyId,
          secretAccessKey,
          bucket,
          region,
          endpoint,
          urlStyle,
          pathPrefix,
        };
      }
      case ESync.WebDav: {
        const { url, username, password } = integrationConfig.webdav;
        const { pathPrefix } = syncConfig.webdav;
        if (!url || !username || !password) {
          return null;
        }
        return {
          provider: "webdav",
          url,
          username,
          password,
          pathPrefix,
        };
      }
      case ESync.Github: {
        const { token, user } = integrationConfig.github;
        const { repo, branch, pathPrefix } = syncConfig.github;
        if (!token || !repo || !branch || !user.name) {
          return null;
        }
        return {
          provider: "github",
          token,
          repo,
          branch,
          pathPrefix,
          user,
        };
      }
      default:
        return null;
    }
  });

  const buildLooseOptions = useMemoizedFn((): ResourceSyncOptions | null => {
    switch (syncConfig.active) {
      case ESync.AliOSS:
        return {
          provider: "alioss",
          accessKeyId: integrationConfig.aliOSS.accessKeyId || "",
          accessKeySecret: integrationConfig.aliOSS.accessKeySecret || "",
          bucket: syncConfig.aliOSS.bucket || "",
          region: syncConfig.aliOSS.region || "",
          path: syncConfig.aliOSS.path || "/",
        };
      case ESync.S3:
        return {
          provider: "s3",
          accessKeyId: integrationConfig.s3.accessKeyId || "",
          secretAccessKey: integrationConfig.s3.secretAccessKey || "",
          bucket: syncConfig.s3.bucket || "",
          region: syncConfig.s3.region || "",
          endpoint: integrationConfig.s3.endpoint,
          urlStyle: integrationConfig.s3.urlStyle,
          pathPrefix: syncConfig.s3.pathPrefix || "",
        };
      case ESync.WebDav:
        return {
          provider: "webdav",
          url: integrationConfig.webdav.url || "",
          username: integrationConfig.webdav.username || "",
          password: integrationConfig.webdav.password || "",
          pathPrefix: syncConfig.webdav.pathPrefix || "",
        };
      case ESync.Github:
        return {
          provider: "github",
          token: integrationConfig.github.token || "",
          repo: syncConfig.github.repo || "",
          branch: syncConfig.github.branch || "",
          pathPrefix: syncConfig.github.pathPrefix || "",
          user: integrationConfig.github.user,
        };
      default:
        return null;
    }
  });

  const refreshProgress = useMemoizedFn(async () => {
    try {
      const current = await getResourceSyncProgress();
      if (current) {
        setProgress(current);
      }
    } catch (e) {
      console.error("获取资源同步进度失败", e);
    }
  });

  const refreshStatuses = useMemoizedFn(
    async (optionsArg?: ResourceSyncOptions | null) => {
      const strictOptions = optionsArg ?? buildOptions();
      const options = strictOptions ?? buildLooseOptions();
      try {
        const data = await refreshResourceSyncStatuses(options || undefined);
        setStatusFile(data);
      } catch (e) {
        console.error("获取资源同步状态失败", e);
        try {
          const data = await getResourceSyncStatuses();
          setStatusFile(data);
        } catch (err) {
          console.error("兜底获取资源同步状态失败", err);
        }
      }
    },
  );

  useEffect(() => {
    const options = buildOptions() || buildLooseOptions();
    if (!options) {
      setStatusFile(null);
      setProgress(emptyProgress);
      return;
    }
    refreshProgress();
    refreshStatuses(options);
  }, [
    syncConfig,
    integrationConfig,
    refreshProgress,
    refreshStatuses,
    buildOptions,
  ]);

  useEffect(() => {
    if (!client) return;

    const handleProgress = (data: any) => {
      if (data?.progress) {
        setProgress(data.progress as IResourceSyncProgress);
      }
    };

    const handleFileStatus = (data: any) => {
      if (!data?.name || !data?.status) return;
      setStatusFile((prev) => {
        const base: ISyncStatusFile = prev || {
          provider: buildOptions()?.provider || "alioss",
          config: {},
          lastSyncTime: null,
          files: {},
        };
        return {
          ...base,
          files: {
            ...base.files,
            [data.name]: data.status,
          },
        };
      });
    };

    const handleCompleted = (data: any) => {
      if (data?.progress) {
        setProgress(data.progress as IResourceSyncProgress);
      }
      refreshStatuses();
    };

    const handleError = (data: any) => {
      if (data?.progress) {
        setProgress(data.progress as IResourceSyncProgress);
      }
    };

    client.registerNotificationHandler(
      "resource-sync:progress-update",
      handleProgress,
    );
    client.registerNotificationHandler(
      "resource-sync:file-status-changed",
      handleFileStatus,
    );
    client.registerNotificationHandler(
      "resource-sync:completed",
      handleCompleted,
    );
    client.registerNotificationHandler("resource-sync:error", handleError);

    return () => {
      client.unregisterNotificationHandler(
        "resource-sync:progress-update",
        handleProgress,
      );
      client.unregisterNotificationHandler(
        "resource-sync:file-status-changed",
        handleFileStatus,
      );
      client.unregisterNotificationHandler(
        "resource-sync:completed",
        handleCompleted,
      );
      client.unregisterNotificationHandler("resource-sync:error", handleError);
    };
  }, [client, refreshStatuses, buildOptions]);

  const start = useMemoizedFn(async () => {
    const options = buildOptions();
    if (!options) {
      return { ok: false, message: "同步配置不完整" };
    }
    const res = await startResourceSync(options);
    if (res?.ok) {
      refreshStatuses();
      refreshProgress();
    }
    return res;
  });

  const resume = useMemoizedFn(async () => {
    const options = buildOptions();
    const res = await resumeResourceSync(options || undefined);
    if (res?.ok) {
      refreshStatuses();
      refreshProgress();
    }
    return res;
  });

  const retryFailed = useMemoizedFn(async () => {
    const options = buildOptions();
    const res = await retryFailedResourceSync(options || undefined);
    if (res?.ok) {
      refreshStatuses();
      refreshProgress();
    }
    return res;
  });

  const cancel = useMemoizedFn(async () => {
    const res = await cancelResourceSync();
    refreshProgress();
    return res;
  });

  return {
    progress,
    statusFile,
    refreshStatuses,
    refreshProgress,
    startSync: start,
    resumeSync: resume,
    retryFailedSync: retryFailed,
    cancelSync: cancel,
  };
};

export default useResourceSync;
