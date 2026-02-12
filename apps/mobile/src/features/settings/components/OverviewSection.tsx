import { useState } from "react";
import type {
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SyncVersionResponse,
} from "../../../types";
import { mapErrorToMessage, parseInvokeError } from "../../../services/errors";
import type { SettingModule } from "./types";
import { IconCloud, IconDatabase, IconFolder, IconMoon, ListItem } from "./ui";

type RefreshFeedback = {
  type: "success" | "error";
  text: string;
};

type OverviewSectionProps = {
  isDark: boolean;
  activeSync: string;
  activeResource: string;
  versions: SyncVersionResponse | null;
  activeDatabase?: string;
  isSyncing: boolean;
  onOpenModule: (module: Exclude<SettingModule, null>) => void;
  onCheckVersions: () => Promise<SyncVersionResponse>;
  onSyncUpload: () => Promise<void>;
  onSyncDownload: () => Promise<void>;
  resourceSyncProgress: ResourceSyncProgress;
  resourceSyncStatusFile: ResourceSyncStatusFile | null;
  isResourceSyncing: boolean;
  onResourceSyncRefresh: () => Promise<void>;
  onResourceSyncStart: () => Promise<void>;
  onResourceSyncRetryFailed: () => Promise<void>;
  onResourceSyncCancel: () => Promise<void>;
};

const resourceStatusTextMap: Record<ResourceSyncProgress["status"], string> = {
  idle: "未开始",
  scanning: "扫描中",
  syncing: "同步中",
  completed: "已完成",
  error: "异常",
  cancelled: "已取消",
};

export function OverviewSection(props: OverviewSectionProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResourceRefreshing, setIsResourceRefreshing] = useState(false);
  const [isResourceSubmitting, setIsResourceSubmitting] = useState(false);
  const [refreshFeedback, setRefreshFeedback] =
    useState<RefreshFeedback | null>(null);
  const [resourceFeedback, setResourceFeedback] =
    useState<RefreshFeedback | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshFeedback(null);
    try {
      const result = await props.onCheckVersions();
      if (result.localVersion === 0 && result.remoteVersion === 0) {
        setRefreshFeedback({
          type: "success",
          text: "刷新完成：本地与远端都没有版本，可能尚未进行首次同步。",
        });
      } else if (result.remoteVersion === 0) {
        setRefreshFeedback({
          type: "success",
          text: `刷新完成：本地版本 ${result.localVersion}，远端还没有版本（可能尚未首次上传）。`,
        });
      } else {
        setRefreshFeedback({
          type: "success",
          text: `刷新完成：本地 ${result.localVersion}，远端 ${result.remoteVersion}。`,
        });
      }
    } catch (error) {
      const parsed = parseInvokeError(error);
      const baseMessage = mapErrorToMessage(
        parsed.code,
        parsed.message || "刷新同步状态失败，请检查同步配置与网络",
      );
      const detailMessage =
        parsed.message && parsed.message !== parsed.code ? parsed.message : "";
      setRefreshFeedback({
        type: "error",
        text:
          detailMessage && detailMessage !== baseMessage
            ? `${baseMessage}（${detailMessage}）`
            : baseMessage,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResourceRefresh = async () => {
    setIsResourceRefreshing(true);
    setResourceFeedback(null);
    try {
      await props.onResourceSyncRefresh();
      setResourceFeedback({
        type: "success",
        text: "资源同步状态已刷新",
      });
    } catch (error) {
      const parsed = parseInvokeError(error);
      setResourceFeedback({
        type: "error",
        text: mapErrorToMessage(
          parsed.code,
          parsed.message || "刷新资源同步状态失败",
        ),
      });
    } finally {
      setIsResourceRefreshing(false);
    }
  };

  const runResourceAction = async (
    action: () => Promise<void>,
    successText: string,
  ) => {
    setIsResourceSubmitting(true);
    setResourceFeedback(null);
    try {
      await action();
      setResourceFeedback({ type: "success", text: successText });
    } catch (error) {
      const parsed = parseInvokeError(error);
      setResourceFeedback({
        type: "error",
        text: mapErrorToMessage(
          parsed.code,
          parsed.message || "资源同步执行失败",
        ),
      });
    } finally {
      setIsResourceSubmitting(false);
    }
  };

  const resourceProgress = props.resourceSyncProgress;
  const resourcePercent =
    resourceProgress.totalFiles > 0
      ? Math.round(
          (resourceProgress.processedFiles / resourceProgress.totalFiles) * 100,
        )
      : 0;
  const resourceStatusText = resourceStatusTextMap[resourceProgress.status];
  const hasFailedFiles = Object.values(
    props.resourceSyncStatusFile?.files || {},
  ).some((item) => item.syncStatus === "error");
  const resourceLastSync =
    props.resourceSyncStatusFile?.lastSyncTime &&
    props.resourceSyncStatusFile.lastSyncTime > 0
      ? new Date(props.resourceSyncStatusFile.lastSyncTime).toLocaleString()
      : "暂无记录";

  return (
    <div className="space-y-4">
      <div className="list-group">
        <ListItem
          icon={<IconMoon />}
          label="颜色主题"
          value={props.isDark ? "深色" : "浅色"}
          onClick={() => props.onOpenModule("theme")}
        />
      </div>

      <div className="list-group">
        <ListItem
          icon={<IconDatabase />}
          label="数据库管理"
          value={props.activeDatabase}
          onClick={() => props.onOpenModule("database")}
        />
      </div>

      <div className="list-group">
        <ListItem
          icon={<IconCloud />}
          label="集成账号"
          onClick={() => props.onOpenModule("integration")}
        />
      </div>

      <div className="list-group">
        <ListItem
          icon={<IconFolder />}
          label="资源存储"
          value={props.activeResource}
          onClick={() => props.onOpenModule("resource")}
        />
      </div>

      <div className="list-group">
        <div className="px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">
          同步设置
        </div>
        <ListItem
          icon={<IconCloud />}
          label="WebDAV"
          value={props.activeSync === "webdav" ? "已启用" : ""}
          onClick={() => props.onOpenModule("sync-webdav")}
        />
        <ListItem
          icon={<IconCloud />}
          label="AliOSS"
          value={props.activeSync === "aliOSS" ? "已启用" : ""}
          onClick={() => props.onOpenModule("sync-alioss")}
        />
        <ListItem
          icon={<IconCloud />}
          label="Github"
          value={props.activeSync === "github" ? "已启用" : ""}
          onClick={() => props.onOpenModule("sync-github")}
        />
        <ListItem
          icon={<IconCloud />}
          label="S3"
          value={props.activeSync === "s3" ? "已启用" : ""}
          onClick={() => props.onOpenModule("sync-s3")}
        />
      </div>

      <div className="list-group p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
            同步状态
          </h3>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={props.isSyncing || isRefreshing}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors active:bg-gray-200 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300 dark:active:bg-neutral-700"
          >
            {isRefreshing ? "刷新中..." : "刷新"}
          </button>
        </div>
        {refreshFeedback && (
          <div
            className={`mb-3 rounded-lg p-2 text-xs ${
              refreshFeedback.type === "success"
                ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
                : "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            }`}
          >
            {refreshFeedback.text}
          </div>
        )}

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">数据库</p>
            <p className="mt-1 truncate text-sm font-semibold text-gray-700 dark:text-gray-200">
              {props.versions?.databaseName ?? "-"}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">本地</p>
            <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
              {props.versions?.localVersion ?? "-"}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">远端</p>
            <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
              {props.versions?.remoteVersion ?? "-"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void props.onSyncUpload()}
            disabled={props.isSyncing}
            className="rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {props.isSyncing ? "处理中..." : "上传"}
          </button>
          <button
            type="button"
            onClick={() => void props.onSyncDownload()}
            disabled={props.isSyncing}
            className="rounded-lg bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-200"
          >
            {props.isSyncing ? "处理中..." : "下载"}
          </button>
        </div>
      </div>

      <div className="list-group p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
            资源同步状态
          </h3>
          <button
            type="button"
            onClick={() => void handleResourceRefresh()}
            disabled={isResourceRefreshing || isResourceSubmitting}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors active:bg-gray-200 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300 dark:active:bg-neutral-700"
          >
            {isResourceRefreshing ? "刷新中..." : "刷新资源"}
          </button>
        </div>

        {resourceFeedback && (
          <div
            className={`mb-3 rounded-lg p-2 text-xs ${
              resourceFeedback.type === "success"
                ? "border border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
                : "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            }`}
          >
            {resourceFeedback.text}
          </div>
        )}

        <div className="mb-3 rounded-lg bg-gray-50 p-3 dark:bg-neutral-900">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>状态：{resourceStatusText}</span>
            <span>
              进度：{resourcePercent}% ({resourceProgress.processedFiles}/
              {resourceProgress.totalFiles})
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 dark:bg-neutral-800">
            <div
              className="h-2 rounded-full bg-gray-700 transition-all dark:bg-neutral-200"
              style={{ width: `${resourcePercent}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
            最近同步：{resourceLastSync}
          </div>
          {resourceProgress.currentFile ? (
            <div className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
              当前文件：{resourceProgress.currentFile}
            </div>
          ) : null}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">待上传</p>
            <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
              {resourceProgress.uploadCount}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">待下载</p>
            <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
              {resourceProgress.downloadCount}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">错误</p>
            <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
              {resourceProgress.errorCount}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">已处理</p>
            <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
              {resourceProgress.processedFiles}/{resourceProgress.totalFiles}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              void runResourceAction(
                props.onResourceSyncStart,
                "资源同步已启动",
              )
            }
            disabled={props.isResourceSyncing || isResourceSubmitting}
            className="rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            开始同步
          </button>
          <button
            type="button"
            onClick={() =>
              void runResourceAction(
                props.onResourceSyncRetryFailed,
                "失败文件重试已启动",
              )
            }
            disabled={
              (!hasFailedFiles && !props.isResourceSyncing) ||
              isResourceSubmitting
            }
            className="rounded-lg bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-200"
          >
            重试失败
          </button>
          <button
            type="button"
            onClick={() =>
              void runResourceAction(
                props.onResourceSyncCancel,
                "已发送停止信号",
              )
            }
            disabled={!props.isResourceSyncing || isResourceSubmitting}
            className="col-span-2 rounded-lg bg-red-500 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            停止同步
          </button>
        </div>
      </div>
    </div>
  );
}
