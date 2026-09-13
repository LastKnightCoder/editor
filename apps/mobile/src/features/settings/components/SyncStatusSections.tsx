import { useState } from "react";
import type {
  ResourceSyncProgress,
  ResourceSyncStatusFile,
  SyncVersionResponse,
} from "../../../types";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { GroupLabel } from "../../../components/GroupLabel";
import { toast } from "../../../components/toast";
import { mapErrorToMessage, parseInvokeError } from "../../../services/errors";
import type { SettingsPageProps } from "./types";
import { Check, Cloud, Download, RefreshCw, Upload } from "lucide-react";
import { GroupActionRow, GroupCard, GroupNote, GroupRow, StatusDot, SwitchButton } from "./ui";

type DatabaseSyncStatusSectionProps = Pick<
  SettingsPageProps,
  "versions" | "isSyncing" | "onCheckVersions" | "onSyncUpload" | "onSyncDownload"
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

export function getDatabaseSyncSummary(versions: SyncVersionResponse | null): string {
  if (!versions) {
    return "未开始";
  }
  if (versions.localVersion === 0 && versions.remoteVersion === 0) {
    return "未开始";
  }
  if (versions.localVersion === versions.remoteVersion) {
    return "已同步";
  }
  return versions.localVersion > versions.remoteVersion ? "本地领先" : "远端领先";
}

function getDatabaseSyncRecommendation(versions: SyncVersionResponse | null): string {
  const summary = getDatabaseSyncSummary(versions);
  if (summary === "已同步") {
    return "本地与远端版本一致";
  }
  if (summary === "本地领先") {
    return "本地有新版本未上传，建议上传到远端";
  }
  if (summary === "远端领先") {
    return "远端有新版本未下载，建议从远端下载";
  }
  return "尚未进行首次同步，建议先检查远端更新";
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
  const baseMessage = mapErrorToMessage(parsed.code, parsed.message || fallback);
  const detailMessage = parsed.message && parsed.message !== parsed.code ? parsed.message : "";
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

/** 状态卡图标气泡的配色与图形（按摘要映射） */
function DatabaseStatusBubble(props: { summary: string; syncing: boolean }) {
  if (props.syncing) {
    return (
      <span className="bg-sky-soft text-sky pulse-soft grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px]">
        <RefreshCw size={20} strokeWidth={2.1} aria-hidden="true" />
      </span>
    );
  }
  if (props.summary === "已同步") {
    return (
      <span className="bg-sage-soft text-sage grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px]">
        <Check size={20} strokeWidth={2.4} aria-hidden="true" />
      </span>
    );
  }
  if (props.summary === "本地领先") {
    return (
      <span className="bg-butter-soft text-butter grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px]">
        <Upload size={19} strokeWidth={2.1} aria-hidden="true" />
      </span>
    );
  }
  if (props.summary === "远端领先") {
    return (
      <span className="bg-butter-soft text-butter grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px]">
        <Download size={19} strokeWidth={2.1} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="bg-input text-ink-2 grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px]">
      <Cloud size={19} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

function VersionCell(props: { label: string; version: number | null }) {
  return (
    <div className="bg-input rounded-[13px] px-3 py-[9px] text-center">
      <p className="text-ink-3 m-0 text-[10.5px] tracking-[1px]">{props.label}</p>
      <p className="text-ink m-0 mt-0.5 text-[19px] font-extrabold tabular-nums tracking-tight">
        {props.version ?? "—"}
      </p>
    </div>
  );
}

export function DatabaseSyncStatusSection(props: DatabaseSyncStatusSectionProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** 待确认的整库覆盖方向；null 表示确认框关闭 */
  const [dangerDir, setDangerDir] = useState<"upload" | "download" | null>(null);
  const summary = getDatabaseSyncSummary(props.versions);
  const recommendation = getDatabaseSyncRecommendation(props.versions);
  const busy = props.isSyncing || isSubmitting || isRefreshing;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await props.onCheckVersions();
      toast.success(buildVersionRefreshMessage(result));
    } catch (error) {
      toast.error(resolveErrorMessage(error, "刷新同步状态失败，请检查同步配置与网络"));
    } finally {
      setIsRefreshing(false);
    }
  };

  const runDatabaseAction = async (
    action: () => Promise<{ message: string }>,
    fallbackSuccess: string
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

  /** 智能同步：先刷新版本，再按本地/远端高低自动选择上传或下载 */
  const handleSmartSync = async () => {
    setIsSubmitting(true);
    try {
      const versions = await props.onCheckVersions();
      if (versions.localVersion >= versions.remoteVersion) {
        const result = await props.onSyncUpload();
        toast.success(result.message || "数据库上传已完成");
      } else {
        const result = await props.onSyncDownload();
        toast.success(result.message || "数据库下载已完成");
      }
    } catch (error) {
      toast.error(resolveErrorMessage(error, "数据库同步执行失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDangerConfirm = async () => {
    const dir = dangerDir;
    setDangerDir(null);
    if (dir === "upload") {
      await runDatabaseAction(props.onSyncUpload, "数据库上传已完成");
    } else if (dir === "download") {
      await runDatabaseAction(props.onSyncDownload, "数据库下载已完成");
    }
  };

  const localVersion = props.versions?.localVersion ?? null;
  const remoteVersion = props.versions?.remoteVersion ?? null;

  return (
    <div className="page-enter space-y-1">
      <section className="list-group p-4">
        <div className="flex items-center gap-3">
          <DatabaseStatusBubble summary={summary} syncing={props.isSyncing} />
          <div className="min-w-0 flex-1">
            <p className="text-ink m-0 text-[15.5px] font-bold">
              {props.isSyncing ? "同步中" : summary}
            </p>
            <p className="text-ink-3 m-0 mt-0.5 truncate text-[11.5px]">
              {props.versions?.databaseName ?? "尚未获取数据库信息"}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <VersionCell label="本地" version={localVersion} />
          <span className="text-ink-3">
            <RefreshCw
              size={16}
              strokeWidth={2}
              className={props.isSyncing ? "pulse-soft" : ""}
              aria-hidden="true"
            />
          </span>
          <VersionCell label="远端" version={remoteVersion} />
        </div>

        <p className="text-ink-2 m-0 mt-3 text-[12.5px] leading-relaxed">{recommendation}。</p>
      </section>

      <GroupLabel>操作</GroupLabel>
      <GroupCard>
        <GroupActionRow onClick={() => void handleSmartSync()} disabled={busy}>
          {isSubmitting ? "同步中…" : "立即同步"}
        </GroupActionRow>
        <GroupActionRow onClick={() => void handleRefresh()} disabled={busy}>
          {isRefreshing ? "检查中…" : "检查远端更新"}
        </GroupActionRow>
      </GroupCard>

      <GroupLabel>整库覆盖 · 危险</GroupLabel>
      <GroupCard>
        <GroupActionRow danger disabled={busy} onClick={() => setDangerDir("upload")}>
          用本地覆盖远端…
        </GroupActionRow>
        <GroupActionRow danger disabled={busy} onClick={() => setDangerDir("download")}>
          用远端覆盖本地…
        </GroupActionRow>
      </GroupCard>
      <GroupNote>
        整库覆盖会丢失被覆盖一侧未同步的改动，执行前会再次确认方向。日常使用「立即同步」即可，它按版本差异自动选择方向。
      </GroupNote>

      <MobileConfirmDialog
        open={dangerDir !== null}
        danger
        title={dangerDir === "upload" ? "用本地覆盖远端？" : "用远端覆盖本地？"}
        description={
          dangerDir === "upload"
            ? `本地数据库（v${localVersion ?? "?"}）将整体上传并覆盖远端（当前 v${remoteVersion ?? "?"}）。远端更新的改动将丢失。`
            : `远端数据库（v${remoteVersion ?? "?"}）将整体下载并覆盖本地（当前 v${localVersion ?? "?"}）。本地未上传的改动将丢失。`
        }
        confirmText={dangerDir === "upload" ? "覆盖远端" : "覆盖本地"}
        loading={isSubmitting}
        onCancel={() => setDangerDir(null)}
        onConfirm={() => void handleDangerConfirm()}
      />
    </div>
  );
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
      toast.error(resolveErrorMessage(error, "刷新资源同步状态失败"));
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
      toast.error(resolveErrorMessage(error, "资源同步执行失败"));
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
            <p className="text-ink m-0 text-[15.5px] font-bold">
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

        <div className="bg-line mt-3 h-[7px] overflow-hidden rounded-full">
          <div
            className="bg-accent h-full rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="bg-input rounded-[12px] py-[9px] text-center">
            <p className="text-ink m-0 text-[16px] font-extrabold tabular-nums">
              {progress.uploadCount}
            </p>
            <p className="text-ink-3 m-0 text-[10.5px]">待上传</p>
          </div>
          <div className="bg-input rounded-[12px] py-[9px] text-center">
            <p className="text-ink m-0 text-[16px] font-extrabold tabular-nums">
              {progress.downloadCount}
            </p>
            <p className="text-ink-3 m-0 text-[10.5px]">待下载</p>
          </div>
          <div
            className={`bg-input rounded-[12px] py-[9px] text-center ${progress.errorCount > 0 ? "text-danger" : ""}`}
          >
            <p
              className={`m-0 text-[16px] font-extrabold tabular-nums ${progress.errorCount > 0 ? "text-danger" : "text-ink"}`}
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
            <span className="text-ink block text-[14px] font-medium">上传前压缩图片</span>
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
