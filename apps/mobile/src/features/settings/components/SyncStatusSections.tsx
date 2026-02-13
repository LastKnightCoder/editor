import { useState } from "react";
import type {
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SyncVersionResponse,
} from "../../../types";
import { toast } from "../../../components/toast";
import { mapErrorToMessage, parseInvokeError } from "../../../services/errors";
import type { SettingsPageProps } from "./types";

type DatabaseSyncStatusSectionProps = Pick<
  SettingsPageProps,
  | "versions"
  | "isSyncing"
  | "onCheckVersions"
  | "onSyncUpload"
  | "onSyncDownload"
>;

type ResourceSyncStatusSectionProps = Pick<
  SettingsPageProps,
  | "resourceSyncProgress"
  | "resourceSyncStatusFile"
  | "isResourceSyncing"
  | "onResourceSyncRefresh"
  | "onResourceSyncStart"
  | "onResourceSyncRetryFailed"
  | "onResourceSyncCancel"
>;

const resourceStatusTextMap: Record<ResourceSyncProgress["status"], string> = {
  idle: "未开始",
  scanning: "扫描中",
  syncing: "同步中",
  completed: "已完成",
  error: "异常",
  cancelled: "已取消",
};

export function getDatabaseSyncSummary(
  versions: SyncVersionResponse | null,
): string {
  if (!versions) {
    return "未开始";
  }
  if (versions.localVersion === 0 && versions.remoteVersion === 0) {
    return "未开始";
  }
  if (versions.localVersion === versions.remoteVersion) {
    return "已同步";
  }
  return versions.localVersion > versions.remoteVersion
    ? "本地领先"
    : "远端领先";
}

function getDatabaseSyncRecommendation(
  versions: SyncVersionResponse | null,
): string {
  const summary = getDatabaseSyncSummary(versions);
  if (summary === "已同步") {
    return "本地与远端版本一致";
  }
  if (summary === "本地领先") {
    return "建议执行上传，避免远端版本落后";
  }
  if (summary === "远端领先") {
    return "建议执行下载，保持本地版本最新";
  }
  return "建议先刷新状态或执行首次同步";
}

function getDatabaseSummaryTone(summary: string): string {
  if (summary === "已同步") {
    return "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300";
  }
  if (summary === "本地领先" || summary === "远端领先") {
    return "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300";
  }
  return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300";
}

function getResourcePercent(progress: ResourceSyncProgress): number {
  if (progress.totalFiles <= 0) {
    return 0;
  }
  return Math.round((progress.processedFiles / progress.totalFiles) * 100);
}

export function getResourceSyncSummary(progress: ResourceSyncProgress): string {
  const percent = getResourcePercent(progress);
  if (progress.status === "scanning" || progress.status === "syncing") {
    return `同步中 ${percent}%`;
  }
  if (progress.status === "completed") {
    return "已完成";
  }
  if (progress.status === "error") {
    return "异常";
  }
  if (progress.status === "cancelled") {
    return "已取消";
  }
  return "未开始";
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  const parsed = parseInvokeError(error);
  const baseMessage = mapErrorToMessage(
    parsed.code,
    parsed.message || fallback,
  );
  const detailMessage =
    parsed.message && parsed.message !== parsed.code ? parsed.message : "";
  if (detailMessage && detailMessage !== baseMessage) {
    return `${baseMessage}（${detailMessage}）`;
  }
  return baseMessage;
}

function buildVersionRefreshMessage(result: SyncVersionResponse): string {
  if (result.localVersion === 0 && result.remoteVersion === 0) {
    return "刷新完成：本地与远端都没有版本，可能尚未进行首次同步。";
  }
  if (result.remoteVersion === 0) {
    return `刷新完成：本地版本 ${result.localVersion}，远端还没有版本（可能尚未首次上传）。`;
  }
  return `刷新完成：本地 ${result.localVersion}，远端 ${result.remoteVersion}。`;
}

export function DatabaseSyncStatusSection(
  props: DatabaseSyncStatusSectionProps,
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const summary = getDatabaseSyncSummary(props.versions);
  const recommendation = getDatabaseSyncRecommendation(props.versions);
  const summaryTone = getDatabaseSummaryTone(summary);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await props.onCheckVersions();
      toast.success(buildVersionRefreshMessage(result));
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, "刷新同步状态失败，请检查同步配置与网络"),
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const runDatabaseAction = async (
    action: () => Promise<{ message: string }>,
    fallbackSuccess: string,
  ) => {
    setIsSubmitting(true);
    try {
      const result = await action();
      toast.success(result.message || fallbackSuccess);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "数据库同步执行失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="list-group p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            当前状态
          </h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${summaryTone}`}
          >
            {summary}
          </span>
        </div>
        <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
          {recommendation}
        </p>
      </section>

      <section className="list-group p-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">数据库</p>
            <p className="mt-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
              {props.versions?.databaseName ?? "-"}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">本地</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {props.versions?.localVersion ?? "-"}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">远端</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {props.versions?.remoteVersion ?? "-"}
            </p>
          </div>
        </div>
      </section>

      <section className="list-group p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing || props.isSyncing || isSubmitting}
            className="h-11 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-200"
          >
            {isRefreshing ? "刷新中..." : "刷新"}
          </button>
          <button
            type="button"
            onClick={() =>
              void runDatabaseAction(props.onSyncUpload, "数据库上传已完成")
            }
            disabled={props.isSyncing || isSubmitting}
            className="h-11 rounded-xl bg-gray-900 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {props.isSyncing ? "处理中..." : "上传"}
          </button>
          <button
            type="button"
            onClick={() =>
              void runDatabaseAction(props.onSyncDownload, "数据库下载已完成")
            }
            disabled={props.isSyncing || isSubmitting}
            className="col-span-2 h-11 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-200"
          >
            {props.isSyncing ? "处理中..." : "下载"}
          </button>
        </div>
      </section>
    </div>
  );
}

function getResourceSummaryTone(summary: string): string {
  if (summary === "已完成") {
    return "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300";
  }
  if (summary.startsWith("同步中")) {
    return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300";
  }
  if (summary === "异常") {
    return "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300";
  }
  return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300";
}

function getResourceLastSyncText(
  statusFile: ResourceSyncStatusFile | null,
): string {
  if (!statusFile?.lastSyncTime || statusFile.lastSyncTime <= 0) {
    return "暂无记录";
  }
  return new Date(statusFile.lastSyncTime).toLocaleString();
}

export function ResourceSyncStatusSection(
  props: ResourceSyncStatusSectionProps,
) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progress = props.resourceSyncProgress;
  const percent = getResourcePercent(progress);
  const statusText = resourceStatusTextMap[progress.status];
  const summary = getResourceSyncSummary(progress);
  const summaryTone = getResourceSummaryTone(summary);
  const lastSyncText = getResourceLastSyncText(props.resourceSyncStatusFile);
  const hasFailedFiles = Object.values(
    props.resourceSyncStatusFile?.files ?? {},
  ).some((item) => item.syncStatus === "error");

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await props.onResourceSyncRefresh();
      toast.success("资源同步状态已刷新");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "刷新资源同步状态失败"));
    } finally {
      setIsRefreshing(false);
    }
  };

  const runResourceAction = async (
    action: () => Promise<{ message: string }>,
    fallbackSuccess: string,
  ) => {
    setIsSubmitting(true);
    try {
      const result = await action();
      toast.success(result.message || fallbackSuccess);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "资源同步执行失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="list-group p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            当前进度
          </h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${summaryTone}`}
          >
            {summary}
          </span>
        </div>

        <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>状态：{statusText}</span>
          <span>
            {percent}% ({progress.processedFiles}/{progress.totalFiles})
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-neutral-800">
          <div
            className="h-2 rounded-full bg-gray-700 transition-all dark:bg-neutral-200"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          最近同步：{lastSyncText}
        </p>
        {progress.currentFile ? (
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
            当前文件：{progress.currentFile}
          </p>
        ) : null}
      </section>

      <section className="list-group p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">待上传</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {progress.uploadCount}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">待下载</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {progress.downloadCount}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">错误</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {progress.errorCount}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center dark:bg-neutral-900">
            <p className="text-xs text-gray-400 dark:text-gray-500">已处理</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {progress.processedFiles}/{progress.totalFiles}
            </p>
          </div>
        </div>
      </section>

      <section className="list-group p-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing || isSubmitting}
            className="h-11 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-200"
          >
            {isRefreshing ? "刷新中..." : "刷新资源"}
          </button>
          <button
            type="button"
            onClick={() =>
              void runResourceAction(
                props.onResourceSyncStart,
                "资源同步已启动",
              )
            }
            disabled={props.isResourceSyncing || isSubmitting}
            className="h-11 rounded-xl bg-gray-900 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
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
              (!hasFailedFiles && !props.isResourceSyncing) || isSubmitting
            }
            className="h-11 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-200"
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
            disabled={!props.isResourceSyncing || isSubmitting}
            className="h-11 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600 transition-transform active:scale-[0.98] disabled:opacity-50 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
          >
            停止同步
          </button>
        </div>
      </section>
    </div>
  );
}
