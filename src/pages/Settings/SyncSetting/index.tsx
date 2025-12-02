import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMemoizedFn, useAsyncEffect } from "ahooks";
import { produce } from "immer";
import { App } from "antd";
import classNames from "classnames";
import { X } from "lucide-react";

import AliOssSetting from "./AliOssSetting";
import S3Setting from "./S3Setting";
import WebDavSetting from "./WebDavSetting";
import GithubSetting from "./GithubSetting";
import ResourceSyncStatusCard from "./components/ResourceSyncStatusCard";
import ResourceSyncFileList from "./components/ResourceSyncFileList";
import ConflictResolveModal from "./components/ConflictResolveModal";
import ResourceSyncBlacklistModal from "./components/ResourceSyncBlacklistModal";
import type { ResourcePreviewItem } from "./components/ResourceThumbnail";

import useSettingStore, { ESync } from "@/stores/useSettingStore";
import {
  download,
  getAllResources,
  getOriginDatabaseInfo,
  upload,
  getEditorDir,
  getSep,
  pathExists,
} from "@/commands";
import CustomModal from "@/components/CustomModal";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";
import {
  SettingContainer,
  SettingSection,
  SettingTabs,
  SettingButton,
  SettingSwitch,
} from "../components";
import useThemeColors from "@/hooks/useThemeColors";
import useResourceSync from "@/hooks/useResourceSync";
import useResourceSyncBlacklist from "@/hooks/useResourceSyncBlacklist";
import { IResource, ResourceSyncStatus } from "@/types";
import { isSyncConfigured } from "@/utils/sync";
import {
  matchResourceByName,
  inferPreviewType,
  LOCAL_RESOURCE_DIR,
  inferResourceType,
} from "./utils";

const normalizeResourceRelativePath = (fileName: string) => {
  const normalized = fileName.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.startsWith(`${LOCAL_RESOURCE_DIR}/`)) {
    return normalized.slice(LOCAL_RESOURCE_DIR.length + 1);
  }
  return normalized;
};

const SyncSetting = () => {
  const { modal, message } = App.useApp();
  const [isSyncing, setIsSyncing] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState(0);
  const themeColors = useThemeColors();
  const { activeKey, sync, activeDatabaseName, activeDatabases, integration } =
    useSettingStore((state) => ({
      sync: state.setting.sync,
      activeKey: state.setting.sync.active,
      activeDatabaseName: state.setting.database.active,
      activeDatabases: state.setting.database.databases,
      integration: state.setting.integration,
    }));
  const setAutoSyncEnabled = useSettingStore(
    (state) => state.setAutoSyncEnabled,
  );
  const isDevMode = process.env.NODE_ENV === "development";

  const activeDatabase = activeDatabases.find(
    (item) => item.name === activeDatabaseName,
  );
  const currentVersion = activeDatabase?.version || 0;

  const canAutoSync = sync.autoSyncEnabled && !isDevMode;
  const isConfigured = useMemo(
    () => isSyncConfigured(activeKey, sync, integration),
    [activeKey, integration, sync],
  );

  const {
    progress: resourceProgress,
    statusFile: resourceStatusFile,
    startSync: startResourceSync,
    retryFailedSync: retryFailedResourceSync,
    cancelSync: cancelResourceSync,
    refreshStatuses: refreshResourceStatuses,
    refreshProgress: refreshResourceProgress,
  } = useResourceSync();
  const {
    items: resourceBlacklist,
    loading: blacklistLoading,
    addItems: addBlacklistItems,
    removeItems: removeBlacklistItems,
  } = useResourceSyncBlacklist();
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [blacklistModalOpen, setBlacklistModalOpen] = useState(false);
  const [resources, setResources] = useState<IResource[]>([]);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceDirPath, setResourceDirPath] = useState("");
  const [imagePreview, setImagePreview] = useState<{
    open: boolean;
    src: string;
    title: string;
  }>({
    open: false,
    src: "",
    title: "",
  });
  const [videoPreview, setVideoPreview] = useState<{
    open: boolean;
    src: string;
    title: string;
  }>({
    open: false,
    src: "",
    title: "",
  });
  const [audioPreview, setAudioPreview] = useState<{
    open: boolean;
    src: string;
    title: string;
  }>({
    open: false,
    src: "",
    title: "",
  });

  const ensureResourceDirPath = useMemoizedFn(async () => {
    if (resourceDirPath) return resourceDirPath;
    const [editorDir, sep] = await Promise.all([getEditorDir(), getSep()]);
    const base = `${editorDir}${sep}${LOCAL_RESOURCE_DIR}${sep}`;
    setResourceDirPath(base);
    return base;
  });

  const resolveLocalResourcePath = useMemoizedFn(async (fileName: string) => {
    try {
      const base = await ensureResourceDirPath();
      const trimmed = normalizeResourceRelativePath(fileName);
      const fullPath = `${base}${trimmed}`;
      if (await pathExists(fullPath)) {
        return fullPath;
      }
      return null;
    } catch (error) {
      console.error("解析本地资源路径失败", error);
      return null;
    }
  });

  const getPreviewResource = useMemoizedFn(
    (fileName: string): ResourcePreviewItem | null => {
      const matched = matchResourceByName(resources, fileName);
      if (matched) {
        return {
          name: matched.name,
          path: matched.path,
          type: matched.type,
        };
      }
      if (!resourceDirPath) return null;
      const inferredType = inferResourceType(fileName);
      if (!inferredType) return null;
      const trimmed = normalizeResourceRelativePath(fileName);
      return {
        name: fileName,
        path: `${resourceDirPath}${trimmed}`,
        type: inferredType,
      };
    },
  );

  const isResourceSyncing =
    resourceProgress.status === "syncing" ||
    resourceProgress.status === "scanning";
  const canResourceSync = isConfigured;
  const resourceErrorFiles = Object.entries(
    resourceStatusFile?.files || {},
  ).filter(([, status]) => status.syncStatus === ResourceSyncStatus.Error);

  const loadResources = useMemoizedFn(async (): Promise<IResource[]> => {
    setResourceLoading(true);
    try {
      const list = await getAllResources();
      setResources(list);
      return list;
    } catch (error) {
      console.error("获取资源列表失败", error);
      message.error("获取资源列表失败");
      return [];
    } finally {
      setResourceLoading(false);
    }
  });

  useAsyncEffect(async () => {
    await ensureResourceDirPath();
  }, [ensureResourceDirPath]);

  useAsyncEffect(async () => {
    await loadResources();
  }, [loadResources]);

  useAsyncEffect(async () => {
    if (!isConfigured) return;
    const originDatabaseInfo = await getOriginDatabaseInfo();
    if (!originDatabaseInfo) return;
    const { databaseInfo = {} } = originDatabaseInfo;
    // @ts-ignore
    const originVersion = Number(databaseInfo.version) || 0;
    setRemoteVersion(originVersion);
  }, [activeKey, sync, integration]);

  const onSync = useMemoizedFn(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await upload();
      if (res) {
        setRemoteVersion(currentVersion + 1);
        message.success("同步成功");
      }
    } catch (error) {
      message.error("同步失败" + error);
    } finally {
      setIsSyncing(false);
    }
  });

  const handleStartResourceSync = useMemoizedFn(async () => {
    const hasFailedFiles = resourceErrorFiles.length > 0;
    const res = hasFailedFiles
      ? await retryFailedResourceSync()
      : await startResourceSync();
    if (res?.ok) {
      message.success(
        hasFailedFiles ? "已重新同步失败的资源文件" : "资源同步已启动",
      );
    } else {
      message.error(res?.message || "资源同步启动失败");
    }
  });

  const handleCancelResourceSync = useMemoizedFn(async () => {
    const res = await cancelResourceSync();
    if (res?.ok) {
      message.success("已停止资源同步");
    } else {
      message.error(res?.message || "停止同步失败");
    }
  });

  const handleRefreshResourceStatus = useMemoizedFn(async () => {
    await refreshResourceStatuses();
    await refreshResourceProgress();
    message.success("已刷新资源同步状态");
  });

  const refreshResourceSyncState = useMemoizedFn(async () => {
    await refreshResourceStatuses();
    await refreshResourceProgress();
  });

  const handleRemoveBlacklistItem = useMemoizedFn(async (fileName: string) => {
    await removeBlacklistItems({ fileNames: [fileName] });
    message.success(`已移出黑名单：${fileName}`);
    await refreshResourceSyncState();
  });

  const handleAddBlacklistItems = useMemoizedFn(async (fileNames: string[]) => {
    const existing = new Set(resourceBlacklist.map((item) => item.fileName));
    const filtered = fileNames.filter((name) => !existing.has(name));
    if (!filtered.length) {
      message.info("所选文件已在黑名单中");
      return;
    }
    await addBlacklistItems(filtered);
    message.success(`已添加 ${filtered.length} 个文件到黑名单`);
    await refreshResourceSyncState();
  });

  const openPreviewModal = useMemoizedFn(
    (type: "image" | "video" | "audio", src: string, title: string) => {
      if (type === "image") {
        setImagePreview({ open: true, src, title });
        return;
      }
      if (type === "video") {
        setVideoPreview({ open: true, src, title });
        return;
      }
      if (type === "audio") {
        setAudioPreview({ open: true, src, title });
      }
    },
  );

  const handlePreviewResource = useMemoizedFn(async (fileName: string) => {
    if (!fileName) return;
    let previewMeta = getPreviewResource(fileName);
    if (!previewMeta) {
      if (resourceLoading) {
        message.info("资源列表加载中，请稍候");
        return;
      }
      const latest = await loadResources();
      const matched = matchResourceByName(latest, fileName);
      if (matched) {
        previewMeta = {
          name: matched.name,
          path: matched.path,
          type: matched.type,
        };
      }
    }
    if (previewMeta) {
      if (
        previewMeta.type === "image" ||
        previewMeta.type === "video" ||
        previewMeta.type === "audio"
      ) {
        openPreviewModal(previewMeta.type, previewMeta.path, previewMeta.name);
      } else {
        message.info("暂不支持预览此类型文件");
      }
      return;
    }
    const localPath = await resolveLocalResourcePath(fileName);
    if (!localPath) {
      message.warning("未找到对应的资源文件，可能已被移除");
      return;
    }
    const type = inferPreviewType(fileName);
    if (!type) {
      message.info("暂不支持预览此类型文件");
      return;
    }
    openPreviewModal(type, localPath, fileName);
  });

  const closeImagePreview = useMemoizedFn(() => {
    setImagePreview((prev) => ({ ...prev, open: false }));
  });

  const closeVideoPreview = useMemoizedFn(() => {
    setVideoPreview((prev) => ({ ...prev, open: false }));
  });

  const closeAudioPreview = useMemoizedFn(() => {
    setAudioPreview((prev) => ({ ...prev, open: false }));
  });

  const checkDownload = useMemoizedFn(async () => {
    if (!isConfigured) {
      message.warning("请先完成同步配置");
      return;
    }
    const originDatabaseInfo = await getOriginDatabaseInfo();
    if (!originDatabaseInfo) return;
    const { databaseInfo = {} } = originDatabaseInfo;
    // @ts-ignore
    const originVersion = Number(databaseInfo.version || 0);
    setRemoteVersion(originVersion);
    if (currentVersion < originVersion) {
      modal.confirm({
        title: "同步远程数据库",
        content: "检测到有新的数据库版本，是否下载？",
        onOk: async () => {
          const isSuccess = await download();
          if (!isSuccess) {
            message.error("下载失败");
          } else {
            message.success(
              "下载成功，已为你刷新数据库，原文件已备份至 backup 文件夹！",
            );
          }
        },
      });
    } else {
      message.success("当前已是最新版本");
    }
  });

  const tabItems = [
    { key: ESync.AliOSS, label: "阿里云 OSS" },
    { key: ESync.S3, label: "S3" },
    { key: ESync.WebDav, label: "WebDAV" },
    { key: ESync.Github, label: "Github" },
  ];

  const renderContent = () => {
    switch (activeKey) {
      case ESync.AliOSS:
        return <AliOssSetting />;
      case ESync.S3:
        return <S3Setting />;
      case ESync.WebDav:
        return <WebDavSetting />;
      case ESync.Github:
        return <GithubSetting />;
      default:
        return <AliOssSetting />;
    }
  };

  return (
    <SettingContainer>
      <SettingSection
        title="数据检查"
        description="查看本地和远程数据库版本，同步或检查数据状态"
      >
        <div className={classNames("mb-6 bg-transparent")}>
          <SettingSwitch
            checked={canAutoSync}
            onChange={setAutoSyncEnabled}
            disabled={isDevMode}
            label="自动同步"
            description="开启后，关闭应用前会自动上传数据库，并在启动时主动检查远程更新并下载。仅在同步配置完整时生效。"
          />
          {isDevMode && (
            <div className="text-xs mt-2 text-amber-500">
              当前为开发模式，自动同步已禁用。
            </div>
          )}
          {!isConfigured && canAutoSync && (
            <div className="text-xs mt-2">
              请完善当前同步服务的配置，否则自动同步不会执行。
            </div>
          )}
        </div>

        {/* 版本信息 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className={classNames("bg-transparent")}>
            <div className={classNames("text-xs mb-1")}>本地版本</div>
            <div className={classNames("text-2xl font-bold")}>
              {currentVersion}
            </div>
          </div>
          <div className={classNames("bg-transparent")}>
            <div className={classNames("text-xs mb-1")}>远程版本</div>
            <div className={classNames("text-2xl font-bold")}>
              {remoteVersion}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div
            className={classNames(
              "flex items-center justify-between bg-transparent",
            )}
          >
            <div>
              <div className={classNames("text-sm font-medium")}>
                同步数据至云端
              </div>
              <div className={classNames("text-xs")}>
                将本地数据库上传到云存储
              </div>
            </div>
            <SettingButton
              variant="primary"
              loading={isSyncing}
              onClick={onSync}
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              }
            >
              同步
            </SettingButton>
          </div>

          <div
            className={classNames(
              "flex items-center justify-between bg-transparent",
            )}
          >
            <div>
              <div
                className={classNames(
                  "text-sm font-medium",
                  themeColors.activeTextClass,
                )}
              >
                检查数据同步状态
              </div>
              <div
                className={classNames(
                  "text-xs",
                  themeColors.secondaryTextClass,
                )}
              >
                检查远程是否有新版本可下载
              </div>
            </div>
            <SettingButton
              variant="secondary"
              onClick={checkDownload}
              icon={
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              }
            >
              检查
            </SettingButton>
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title="数据同步设置"
        description="配置云存储服务，支持阿里云 OSS、S3、WebDAV 和 Github"
      >
        <SettingTabs
          activeKey={activeKey}
          onChange={(key) => {
            useSettingStore.setState(
              produce((draft) => {
                draft.setting.sync.active = key as ESync;
              }),
            );
          }}
          items={tabItems}
        />

        <div className="mt-6">{renderContent()}</div>
      </SettingSection>

      <SettingSection
        title="资源同步"
        description="同步本地 resources 文件夹到云端，支持中断恢复和实时进度查看"
        className="mb-0!"
      >
        <div className="space-y-4">
          <ResourceSyncStatusCard
            progress={resourceProgress}
            statusFile={resourceStatusFile}
            onSync={handleStartResourceSync}
            onCancel={handleCancelResourceSync}
            onRefresh={handleRefreshResourceStatus}
            onShowIssues={() => setIssueModalOpen(true)}
            canSync={canResourceSync}
            syncing={isResourceSyncing}
          />
          <ResourceSyncFileList
            statusFile={resourceStatusFile}
            syncing={isResourceSyncing}
            blacklist={resourceBlacklist}
            blacklistLoading={blacklistLoading}
            onManageBlacklist={() => setBlacklistModalOpen(true)}
            onRemoveBlacklistItem={handleRemoveBlacklistItem}
            onPreviewFile={handlePreviewResource}
            getPreviewResource={getPreviewResource}
          />
        </div>
      </SettingSection>

      <ConflictResolveModal
        open={issueModalOpen}
        files={resourceErrorFiles.map(([name, status]) => ({
          name,
          status,
        }))}
        onClose={() => setIssueModalOpen(false)}
        onRetry={async () => {
          await handleStartResourceSync();
          setIssueModalOpen(false);
        }}
      />
      <ResourceSyncBlacklistModal
        open={blacklistModalOpen}
        onClose={() => setBlacklistModalOpen(false)}
        onConfirm={handleAddBlacklistItems}
        blacklistNames={resourceBlacklist.map((item) => item.fileName)}
      />
      <CustomModal
        open={videoPreview.open}
        onCancel={closeVideoPreview}
        footer={null}
        title={videoPreview.title || "视频预览"}
        width={720}
        destroyOnClose
      >
        {videoPreview.src && (
          <LocalVideo
            src={videoPreview.src}
            controls
            autoPlay
            className="w-full rounded-lg"
            style={{ maxHeight: "70vh" }}
          />
        )}
      </CustomModal>
      <CustomModal
        open={audioPreview.open}
        onCancel={closeAudioPreview}
        footer={null}
        title={audioPreview.title || "音频预览"}
        width={480}
        destroyOnClose
      >
        {audioPreview.src && (
          <LocalAudio
            src={audioPreview.src}
            controls
            autoPlay
            className="w-full"
          />
        )}
      </CustomModal>
      {imagePreview.open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-11000 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={closeImagePreview}
          >
            <button
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
              onClick={(e) => {
                e.stopPropagation();
                closeImagePreview();
              }}
            >
              <X className="w-6 h-6" />
            </button>
            <div
              className="max-h-[90vh] max-w-[90vw] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <LocalImage
                url={imagePreview.src}
                alt={imagePreview.title}
                className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
              />
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/50 text-white text-sm max-w-[80vw] truncate">
              {imagePreview.title}
            </div>
          </div>,
          document.body,
        )}
    </SettingContainer>
  );
};

export default SyncSetting;
