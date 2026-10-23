import { useState } from "react";
import type { ResourceSyncProgress, ResourceSyncStatusFile } from "../../../types";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { resolveSyncErrorMessage } from "../sync/syncErrors";
import type { SettingsPageProps } from "./types";
import { GroupActionRow, GroupCard, GroupNote, GroupRow, StatusDot, SwitchButton } from "./ui";

type ResourceSyncStatusSectionProps = Pick<
  SettingsPageProps,
  | "resourceSyncProgress"
  | "resourceSyncStatusFile"
  | "isResourceSyncing"
  | "onResourceSyncRefresh"
  | "onResourceSyncStart"
  | "onResourceSyncRetryFailed"
  | "onResourceSyncCancel"
  | "updateSetting"
> & {
  compressionEnabled: boolean;
};

const resourceStatusTextMap: Record<ResourceSyncProgress["status"], string> = {
  idle: "未开始",
  scanning: "扫描中",
  syncing: "同步中",
  completed: "已完成",
  error: "异常",
  cancelled: "已取消",
};

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

function getResourceSummaryTone(summary: string): "ok" | "run" | "warn" | "idle" {
  if (summary === "已完成") {
    return "ok";
  }
  if (summary.startsWith("同步中") || summary === "扫描中") {
    return "run";
  }
  if (summary === "异常") {
    return "warn";
  }
  return "idle";
}

function getResourceLastSyncText(statusFile: ResourceSyncStatusFile | null): string {
  if (!statusFile?.lastSyncTime || statusFile.lastSyncTime <= 0) {
    return "暂无记录";
  }
  return new Date(statusFile.lastSyncTime).toLocaleString();
}

export function ResourceSyncStatusSection(props: ResourceSyncStatusSectionProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progress = props.resourceSyncProgress;
  const percent = getResourcePercent(progress);
  const statusText = resourceStatusTextMap[progress.status];
  const summary = getResourceSyncSummary(progress);
  const tone = getResourceSummaryTone(summary);
  const lastSyncText = getResourceLastSyncText(props.resourceSyncStatusFile);
  const hasFailedFiles = Object.values(props.resourceSyncStatusFile?.files ?? {}).some(
    item => item.syncStatus === "error"
  );
  const busy = props.isResourceSyncing || isSubmitting || isRefreshing;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await props.onResourceSyncRefresh();
      toast.success("资源同步状态已刷新");
    } catch (error) {
      toast.error(resolveSyncErrorMessage(error, "刷新资源同步状态失败"));
    } finally {
      setIsRefreshing(false);
    }
  };

  const runResourceAction = async (
    action: () => Promise<{ message: string }>,
    fallbackSuccess: string
  ) => {
    setIsSubmitting(true);
    try {
      const result = await action();
      toast.success(result.message || fallbackSuccess);
    } catch (error) {
      toast.error(resolveSyncErrorMessage(error, "资源同步执行失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-enter space-y-1">
      <section className="list-group p-4">
        <div className="flex items-center gap-3">
          <StatusDot tone={tone} />
          <div className="min-w-0 flex-1">
            <p className="text-ink-1 m-0 text-[15.5px] font-bold">
              {summary}
              <span className="text-ink-3 ml-2 text-[12px] font-medium tabular-nums">
                {progress.processedFiles}/{progress.totalFiles}
              </span>
            </p>
            <p className="text-ink-3 m-0 mt-0.5 truncate text-[11.5px]">
              {progress.currentFile ? progress.currentFile : `状态：${statusText}`}
            </p>
          </div>
        </div>

        <div className="bg-line-1 mt-3 h-[7px] overflow-hidden rounded-full">
          <div
            className="bg-accent h-full rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="bg-page rounded-[12px] py-[9px] text-center">
            <p className="text-ink-1 m-0 text-[16px] font-extrabold tabular-nums">
              {progress.uploadCount}
            </p>
            <p className="text-ink-3 m-0 text-[10.5px]">待上传</p>
          </div>
          <div className="bg-page rounded-[12px] py-[9px] text-center">
            <p className="text-ink-1 m-0 text-[16px] font-extrabold tabular-nums">
              {progress.downloadCount}
            </p>
            <p className="text-ink-3 m-0 text-[10.5px]">待下载</p>
          </div>
          <div
            className={`bg-page rounded-[12px] py-[9px] text-center ${progress.errorCount > 0 ? "text-danger" : ""}`}
          >
            <p
              className={`m-0 text-[16px] font-extrabold tabular-nums ${progress.errorCount > 0 ? "text-danger" : "text-ink-1"}`}
            >
              {progress.errorCount}
            </p>
            <p className="text-ink-3 m-0 text-[10.5px]">失败</p>
          </div>
        </div>
      </section>

      <GroupLabel>操作</GroupLabel>
      <GroupCard>
        <GroupActionRow
          onClick={() => void runResourceAction(props.onResourceSyncStart, "资源同步已启动")}
          disabled={busy}
        >
          {props.isResourceSyncing ? "同步进行中…" : "开始 / 继续同步"}
        </GroupActionRow>
        <GroupActionRow onClick={() => void handleRefresh()} disabled={busy}>
          {isRefreshing ? "刷新中…" : "刷新状态"}
        </GroupActionRow>
        <GroupActionRow
          onClick={() =>
            void runResourceAction(props.onResourceSyncRetryFailed, "失败文件重试已启动")
          }
          disabled={!hasFailedFiles || isSubmitting}
        >
          {hasFailedFiles ? "重试失败文件" : "重试失败文件（无失败记录）"}
        </GroupActionRow>
        <GroupActionRow
          danger
          onClick={() => void runResourceAction(props.onResourceSyncCancel, "已发送停止信号")}
          disabled={!props.isResourceSyncing || isSubmitting}
        >
          停止同步
        </GroupActionRow>
      </GroupCard>

      <GroupLabel>上传选项</GroupLabel>
      <GroupCard>
        <GroupRow>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 block text-[14px] font-medium">上传前压缩图片</span>
            <span className="text-ink-3 block text-[11.5px]">png / jpg 自动转 webp</span>
          </span>
          <SwitchButton
            checked={props.compressionEnabled}
            onChange={() =>
              props.updateSetting(
                prev => ({
                  ...prev,
                  imageBed: {
                    ...prev.imageBed,
                    enableCompression: !prev.imageBed.enableCompression,
                  },
                }),
                { persist: true }
              )
            }
          />
        </GroupRow>
      </GroupCard>

      <GroupNote>
        最近同步：{lastSyncText}。资源同步只做增量上传与下载，不会删除远端文件。
      </GroupNote>
    </div>
  );
}
