import dayjs from "dayjs";
import classNames from "classnames";
import { IResourceSyncProgress, ISyncStatusFile } from "@/types";
import { SettingButton } from "../../components";
import useThemeColors from "@/hooks/useThemeColors";

interface ResourceSyncStatusCardProps {
  progress: IResourceSyncProgress;
  statusFile: ISyncStatusFile | null;
  onSync: () => Promise<unknown>;
  onCancel: () => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
  onShowIssues: () => void;
  canSync: boolean;
  syncing: boolean;
}

const statusTexts: Record<IResourceSyncProgress["status"], string> = {
  idle: "未开始",
  scanning: "扫描资源中",
  syncing: "同步中",
  completed: "已完成",
  error: "异常",
  cancelled: "已取消",
};

const ResourceSyncStatusCard = ({
  progress,
  statusFile,
  onSync,
  onCancel,
  onRefresh,
  onShowIssues,
  canSync,
  syncing,
}: ResourceSyncStatusCardProps) => {
  const themeColors = useThemeColors();
  const isSyncing = syncing;
  const percent =
    progress.totalFiles > 0 ? Math.round((progress.processedFiles / progress.totalFiles) * 100) : 0;

  const stats = [
    { label: "总数", value: progress.totalFiles },
    { label: "上传", value: progress.uploadCount },
    { label: "下载", value: progress.downloadCount },
    { label: "跳过", value: progress.skippedCount },
    { label: "错误", value: progress.errorCount },
    {
      label: "已处理",
      value: `${progress.processedFiles}/${progress.totalFiles || 0}`,
    },
  ];

  return (
    <div
      className={classNames(
        "rounded-2xl border border-[#f0f0f0] bg-transparent p-6 dark:border-[#2a2a2a]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={classNames("flex items-center gap-2 text-sm font-medium")}>
            资源同步
            <span
              className={classNames(
                "rounded-full border px-2 py-0.5 text-xs",
                progress.status === "completed"
                  ? "border-[var(--th-success)]/30 bg-[var(--th-success)]/10 text-status-success"
                  : progress.status === "error"
                    ? "border-[var(--th-danger)]/30 bg-[var(--th-danger)]/10 text-status-error"
                    : progress.status === "syncing" || progress.status === "scanning"
                      ? "border-[var(--th-info)]/30 bg-[var(--th-info)]/10 text-status-info"
                      : themeColors.cardBorderClass
              )}
            >
              {statusTexts[progress.status]}
            </span>
          </div>
          <div className={classNames("mt-2 text-xs", themeColors.secondaryTextClass)}>
            最近同步：
            {statusFile?.lastSyncTime
              ? dayjs(statusFile.lastSyncTime).format("YYYY-MM-DD HH:mm")
              : "暂无记录"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SettingButton onClick={onSync} disabled={!canSync || isSyncing} loading={isSyncing}>
            同步
          </SettingButton>
          <SettingButton variant="danger" onClick={onCancel} disabled={!isSyncing}>
            停止
          </SettingButton>
          <SettingButton variant="secondary" onClick={onRefresh}>
            刷新
          </SettingButton>
        </div>
      </div>

      <div className="mt-4">
        <div
          className={classNames(
            "mb-1 flex items-center justify-between text-xs",
            themeColors.secondaryTextClass
          )}
        >
          <span>同步进度</span>
          <span>
            {percent}% ({progress.processedFiles}/{progress.totalFiles || 0})
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
          <div
            className={classNames("h-full rounded-full", themeColors.primaryButtonClass)}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        {stats.map(item => (
          <div key={item.label} className={classNames("bg-transparent p-3")}>
            <div className={classNames("mb-1 text-xs", themeColors.secondaryTextClass)}>
              {item.label}
            </div>
            <div className={classNames("text-base font-semibold")}>{item.value}</div>
          </div>
        ))}
      </div>

      {progress.errorCount > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <div className={classNames("text-xs", themeColors.secondaryTextClass)}>
            检测到 {progress.errorCount} 个问题文件，请检查后重试
          </div>
          <SettingButton variant="secondary" onClick={onShowIssues}>
            查看详情
          </SettingButton>
        </div>
      )}
    </div>
  );
};

export default ResourceSyncStatusCard;
