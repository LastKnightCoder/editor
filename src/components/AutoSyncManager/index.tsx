import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import useThemeColors from "@/hooks/useThemeColors";
import useSettingStore from "@/stores/useSettingStore";
import {
  closeWindow,
  download,
  getOriginDatabaseInfo,
  upload,
} from "@/commands";
import { isSyncConfigured } from "@/utils/sync";

type ProgressState = {
  open: boolean;
  progress: number;
  status: string;
};

const clampProgress = (value: number) => {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const noop = () => undefined;

interface ProgressModalProps extends ProgressState {
  title: string;
  subtitle: string;
  themeColors: ReturnType<typeof useThemeColors>;
}

const ProgressModal = ({
  open,
  progress,
  status,
  title,
  subtitle,
  themeColors,
}: ProgressModalProps) => {
  return (
    <CustomModal
      open={open}
      onCancel={noop}
      maskClosable={false}
      closeOnEscape={false}
      showCloseButton={false}
      footer={null}
      width={420}
      overlayClassName="z-[120]"
      bodyClassName="space-y-6"
    >
      <div className="space-y-2">
        <div
          className={classNames(
            "text-lg font-semibold",
            themeColors.activeTextClass,
          )}
        >
          {title}
        </div>
        <p
          className={classNames(
            "text-sm leading-relaxed",
            themeColors.secondaryTextClass,
          )}
        >
          {subtitle}
        </p>
      </div>
      <div
        className={classNames(
          "rounded-2xl border p-5",
          themeColors.cardBgClass,
          themeColors.cardBorderClass,
        )}
      >
        <div className="flex items-center justify-between mb-3 text-sm font-medium">
          <span className={themeColors.activeTextClass}>{status}</span>
          <span className={themeColors.secondaryTextClass}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/30 dark:bg-slate-800/70 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out shadow-lg"
            style={{
              width: `${clampProgress(progress)}%`,
              background: `linear-gradient(90deg, ${themeColors.accentSoftBg}, ${themeColors.accentColor})`,
              boxShadow: `0 0 20px ${themeColors.accentSoftBg}`,
            }}
          />
        </div>
      </div>
    </CustomModal>
  );
};

const AutoSyncManager = () => {
  const themeColors = useThemeColors();
  const { sync, integration, database } = useSettingStore((state) => ({
    sync: state.setting.sync,
    integration: state.setting.integration,
    database: state.setting.database,
  }));
  const isDevMode = process.env.NODE_ENV === "development";
  const { message } = App.useApp();

  const activeDatabase = useMemo(
    () => database.databases.find((item) => item.name === database.active),
    [database.active, database.databases],
  );
  const currentVersion = activeDatabase?.version ?? 0;
  const isConfigured = useMemo(
    () => isSyncConfigured(sync.active, sync, integration),
    [integration, sync],
  );
  const shouldAutoSync = !isDevMode && sync.autoSyncEnabled && isConfigured;

  const [uploadState, setUploadState] = useState<ProgressState>({
    open: false,
    progress: 0,
    status: "正在准备同步数据...",
  });
  const [downloadState, setDownloadState] = useState<ProgressState>({
    open: false,
    progress: 0,
    status: "正在检查远程版本...",
  });

  const hasCheckedOnLaunch = useRef(false);
  const uploadInProgressRef = useRef(false);
  const downloadInProgressRef = useRef(false);
  const closingRef = useRef(false);
  const pendingCloseRef = useRef(false);
  const uploadProgressTimerRef = useRef<number | null>(null);
  const uploadStartProgressRef = useRef(0);
  const smoothingDurationMs = 5000;

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
    message.error("自动同步失败，正在直接关闭应用");
    await closeAfterSync();
  }, [closeAfterSync, message]);

  const stopFakeUploadProgress = useCallback(() => {
    if (uploadProgressTimerRef.current !== null) {
      window.clearInterval(uploadProgressTimerRef.current);
      uploadProgressTimerRef.current = null;
    }
  }, []);

  const startFakeUploadProgress = useCallback(
    (startProgress = 5) => {
      stopFakeUploadProgress();
      const initial = Math.min(startProgress, 99);
      uploadStartProgressRef.current = initial;
      const startTime = Date.now();
      setUploadState((prev) => ({
        ...prev,
        open: true,
        progress: initial,
      }));
      uploadProgressTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        const ratio = Math.min(elapsed / smoothingDurationMs, 1);
        const nextProgress =
          uploadStartProgressRef.current +
          (99 - uploadStartProgressRef.current) * ratio;
        setUploadState((prev) => ({
          ...prev,
          open: true,
          progress: clampProgress(nextProgress),
        }));
        if (ratio >= 1) {
          stopFakeUploadProgress();
        }
      }, 100);
    },
    [smoothingDurationMs, stopFakeUploadProgress],
  );

  const startAutoUpload = useCallback(async () => {
    if (!shouldAutoSync || uploadInProgressRef.current) {
      return;
    }
    uploadInProgressRef.current = true;
    setUploadState({
      open: true,
      progress: 5,
      status: "正在准备同步数据...",
    });
    startFakeUploadProgress(5);
    let success = false;
    try {
      success = await upload({
        onProgress: ({ status }) => {
          setUploadState((prev) => ({
            ...prev,
            open: true,
            status,
          }));
        },
      });
    } catch (error) {
      console.error("Auto sync upload failed", error);
    }
    uploadInProgressRef.current = false;
    stopFakeUploadProgress();
    if (success) {
      setUploadState((prev) => ({
        ...prev,
        open: true,
        progress: 100,
        status: "同步完成",
      }));
    }
    if (success && pendingCloseRef.current) {
      await closeAfterSync();
    } else if (!success && pendingCloseRef.current) {
      await handleUploadFailureWhileClosing();
    } else if (!success) {
      pendingCloseRef.current = false;
    }
  }, [
    shouldAutoSync,
    closeAfterSync,
    handleUploadFailureWhileClosing,
    startFakeUploadProgress,
    stopFakeUploadProgress,
  ]);

  useEffect(() => {
    if (!shouldAutoSync) {
      pendingCloseRef.current = false;
      stopFakeUploadProgress();
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
      const originDatabaseInfo = await getOriginDatabaseInfo();
      if (canceled || !originDatabaseInfo) return;
      const { databaseInfo } = originDatabaseInfo;
      const remoteVersion = Number(databaseInfo.version || 0);
      if (!Number.isFinite(remoteVersion)) return;
      if (currentVersion >= remoteVersion) {
        return;
      }

      downloadInProgressRef.current = true;
      setDownloadState({
        open: true,
        progress: 10,
        status: "检测到远程新版本，准备下载...",
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
      setDownloadState((prev) => ({ ...prev, open: false }));
      if (success) {
        setTimeout(() => window.location.reload(), 300);
      } else {
        hasCheckedOnLaunch.current = false;
      }
    };

    checkRemoteVersion();

    return () => {
      canceled = true;
    };
  }, [shouldAutoSync, currentVersion, sync.active]);

  useEffect(
    () => () => {
      stopFakeUploadProgress();
    },
    [stopFakeUploadProgress],
  );

  return (
    <>
      <ProgressModal
        open={uploadState.open}
        progress={uploadState.progress}
        status={uploadState.status}
        title="正在自动同步数据"
        subtitle="应用将在同步完成后自动关闭，请稍候。"
        themeColors={themeColors}
      />
      <ProgressModal
        open={downloadState.open}
        progress={downloadState.progress}
        status={downloadState.status}
        title="正在下载远程数据"
        subtitle="检测到云端存在新的数据库版本，正在为你下载并刷新数据。"
        themeColors={themeColors}
      />
    </>
  );
};

export default AutoSyncManager;
