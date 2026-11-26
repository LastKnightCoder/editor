import { autoSyncTranslator, useAutoSyncI18n } from "./i18n";
import { formatDatabaseSyncStatus, type DatabaseSyncStatus } from "@tau/shared/sync-progress";
import { localDatabaseVersion } from "@tau/db-schema/sync-protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogBody, toast } from "@tau/ui";

import useSettingStore from "@/stores/useSettingStore";
import {
  closeWindow,
  download,
  getRemoteDatabaseVersion,
  notifyAppQuittingReady,
  upload,
} from "@/commands";
import { on, off } from "@/electron";
import { isSyncConfigured } from "@/utils/sync";
import { runUsageSync } from "@/services/usageSyncRunner";

type ProgressState = {
  open: boolean;
  progress: number;
  status: DatabaseSyncStatus;
};

const clampProgress = (value: number) => {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

interface ProgressModalProps extends ProgressState {
  title: string;
  subtitle: string;
}

/** 同步进行中不可关闭：半途退出会留下不完整的库 */
const ProgressModal = ({ open, progress, status, title, subtitle }: ProgressModalProps) => {
  const { locale } = useAutoSyncI18n();
  return (
    <Dialog open={open} onOpenChange={() => undefined} critical title={title} subtitle={subtitle}>
      <DialogBody>
        <div className="text-tau-meta mb-2 flex items-center justify-between gap-3">
          <span className="text-ink-1 min-w-0 truncate">
            {formatDatabaseSyncStatus(status, locale)}
          </span>
          <span className="text-ink-3 shrink-0 tabular-nums">{Math.round(progress)}%</span>
        </div>
        <div className="bg-track h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-300"
            style={{ width: `${clampProgress(progress)}%` }}
          />
        </div>
      </DialogBody>
    </Dialog>
  );
};

const AutoSyncManager = () => {
  const { t } = useAutoSyncI18n();
  const sync = useSettingStore(state => state.setting.sync);
  const database = useSettingStore(state => state.setting.database);
  const isDevMode = process.env.NODE_ENV === "development";

  const activeDatabase = useMemo(
    () => database.databases.find(item => item.name === database.active),
    [database.active, database.databases]
  );
  const currentVersion = localDatabaseVersion(activeDatabase);
  const isConfigured = useMemo(() => isSyncConfigured(sync.active, sync), [sync]);
  const shouldAutoSync = !isDevMode && sync.autoSyncEnabled && isConfigured;

  const [uploadState, setUploadState] = useState<ProgressState>({
    open: false,
    progress: 0,
    status: { kind: "prepare-sync" },
  });
  const [downloadState, setDownloadState] = useState<ProgressState>({
    open: false,
    progress: 0,
    status: { kind: "check-remote" },
  });

  const hasCheckedOnLaunch = useRef(false);
  const uploadInProgressRef = useRef(false);
  const downloadInProgressRef = useRef(false);
  const closingRef = useRef(false);
  const pendingCloseRef = useRef(false);
  const pendingQuitRef = useRef(false);

  const closeAfterSync = useCallback(async () => {
    closingRef.current = true;
    pendingCloseRef.current = false;
    try {
      await closeWindow();
    } catch (error) {
      console.error("Failed to close window after auto sync", error);
      closingRef.current = false;
    }
  }, []);

  const handleUploadFailureWhileClosing = useCallback(async () => {
    toast.error(autoSyncTranslator.t("closeFailed"));
    await closeAfterSync();
  }, [closeAfterSync]);

  const startAutoUpload = useCallback(async () => {
    if (!shouldAutoSync || uploadInProgressRef.current) {
      return;
    }
    uploadInProgressRef.current = true;
    setUploadState({
      open: true,
      progress: 0,
      status: { kind: "prepare-sync" },
    });
    let success = false;
    try {
      success = await upload({
        skipWhenRemoteNewer: true,
        onProgress: ({ value, status }) => {
          setUploadState({ open: true, progress: clampProgress(value), status });
        },
      });
    } catch (error) {
      console.error("Auto sync upload failed", error);
    }
    uploadInProgressRef.current = false;
    // 用量同步搭车但不参与退出等待：退出时主进程最多等 8 秒，用量宁可留到下次启动
    if (success && !pendingCloseRef.current && !pendingQuitRef.current) {
      void runUsageSync();
    }
    if (success) {
      setUploadState(prev => ({
        ...prev,
        open: true,
        progress: 100,
        status: { kind: "sync-complete" },
      }));
    }
    if (success && pendingCloseRef.current) {
      await closeAfterSync();
    } else if (!success && pendingCloseRef.current) {
      await handleUploadFailureWhileClosing();
    } else if (pendingQuitRef.current) {
      pendingQuitRef.current = false;
      void notifyAppQuittingReady();
    } else if (!success) {
      pendingCloseRef.current = false;
    }
  }, [shouldAutoSync, closeAfterSync, handleUploadFailureWhileClosing]);

  // 应用受控退出流程：先完成自动同步再放行退出（主进程最多等 8 秒）
  useEffect(() => {
    const handler = () => {
      if (downloadInProgressRef.current) {
        // 正在拉取远程同步数据，退出优先，直接放行
        void notifyAppQuittingReady();
        return;
      }
      if (uploadInProgressRef.current) {
        // 已有上传在跑，结束后由 startAutoUpload 统一回执
        pendingQuitRef.current = true;
        return;
      }
      if (!shouldAutoSync) {
        void notifyAppQuittingReady();
        return;
      }
      pendingQuitRef.current = true;
      void startAutoUpload();
    };
    on("app:quitting", handler);
    return () => off("app:quitting", handler);
  }, [shouldAutoSync, startAutoUpload]);

  useEffect(() => {
    if (!shouldAutoSync) {
      pendingCloseRef.current = false;
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      if (closingRef.current) return;
      if (downloadInProgressRef.current) {
        event.preventDefault();
        event.returnValue = "";
        return;
      }
      event.preventDefault();
      event.returnValue = "";
      if (!pendingCloseRef.current) {
        pendingCloseRef.current = true;
        startAutoUpload();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [shouldAutoSync, startAutoUpload]);

  useEffect(() => {
    let canceled = false;
    if (!shouldAutoSync) {
      hasCheckedOnLaunch.current = false;
      return () => {
        canceled = true;
      };
    }
    if (hasCheckedOnLaunch.current || downloadInProgressRef.current) {
      return () => {
        canceled = true;
      };
    }
    hasCheckedOnLaunch.current = true;

    const checkRemoteVersion = async () => {
      const { version: remoteVersion } = await getRemoteDatabaseVersion();
      if (canceled || currentVersion >= remoteVersion) {
        return;
      }

      downloadInProgressRef.current = true;
      setDownloadState({
        open: true,
        progress: 10,
        status: { kind: "prepare-remote-download" },
      });

      let success = false;
      try {
        success = await download({
          onProgress: ({ value, status }) => {
            if (canceled) return;
            setDownloadState({
              open: true,
              progress: clampProgress(value),
              status,
            });
          },
        });
      } catch (error) {
        console.error("Auto sync download failed", error);
      }

      downloadInProgressRef.current = false;
      if (canceled) return;
      setDownloadState(prev => ({ ...prev, open: false }));
      if (!success) hasCheckedOnLaunch.current = false;
    };

    // 用量同步独立于库快照，启动时在后台运行。
    void runUsageSync();
    checkRemoteVersion();

    return () => {
      canceled = true;
    };
  }, [shouldAutoSync, currentVersion, sync.active]);

  return (
    <>
      <ProgressModal
        open={uploadState.open}
        progress={uploadState.progress}
        status={uploadState.status}
        title={t("upload.title")}
        subtitle={t("upload.description")}
      />
      <ProgressModal
        open={downloadState.open}
        progress={downloadState.progress}
        status={downloadState.status}
        title={t("download.title")}
        subtitle={t("download.description")}
      />
    </>
  );
};

export default AutoSyncManager;
