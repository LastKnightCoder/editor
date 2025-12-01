import classNames from "classnames";
import dayjs from "dayjs";
import { ISyncStatusFile, ResourceSyncStatus } from "@/types";
import useThemeColors from "@/hooks/useThemeColors";

interface ResourceSyncFileListProps {
  statusFile: ISyncStatusFile | null;
  syncing: boolean;
}

const statusBadge = (status: ResourceSyncStatus) => {
  switch (status) {
    case ResourceSyncStatus.Syncing:
      return "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-200 dark:bg-blue-900/30 dark:border-blue-900/50";
    case ResourceSyncStatus.Synced:
      return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-900/50";
    case ResourceSyncStatus.Error:
      return "text-red-600 bg-red-50 border-red-200 dark:text-red-200 dark:bg-red-900/30 dark:border-red-900/50";
    default:
      return "text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-200 dark:bg-slate-900/40 dark:border-slate-800";
  }
};

const directionText = (direction: "upload" | "download" | null) => {
  if (direction === "upload") return "上传";
  if (direction === "download") return "下载";
  return "跳过";
};

const formatSize = (size: number | null | undefined) => {
  if (!size || size <= 0) return "-";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
};

const statusOrder: Record<ResourceSyncStatus, number> = {
  [ResourceSyncStatus.Error]: 0,
  [ResourceSyncStatus.Syncing]: 1,
  [ResourceSyncStatus.Pending]: 2,
  [ResourceSyncStatus.Synced]: 3,
};

const ResourceSyncFileList = ({
  statusFile,
  syncing,
}: ResourceSyncFileListProps) => {
  const themeColors = useThemeColors();

  const entries = Object.entries(statusFile?.files || {}).sort(
    ([aKey, a], [bKey, b]) => {
      const orderDiff = statusOrder[a.syncStatus] - statusOrder[b.syncStatus];
      if (orderDiff !== 0) return orderDiff;
      return aKey.localeCompare(bKey);
    },
  );

  if (!entries.length) {
    return (
      <div
        className={classNames(
          "p-4 rounded-xl border text-sm",
          themeColors.cardBgClass,
          themeColors.cardBorderClass,
          themeColors.secondaryTextClass,
        )}
      >
        暂无资源同步记录，点击上方「开始」即可同步 resources 文件夹。
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "rounded-xl border",
        themeColors.cardBgClass,
        themeColors.cardBorderClass,
      )}
    >
      <div
        className={classNames(
          "grid grid-cols-5 px-4 py-3 text-xs font-medium",
          themeColors.secondaryTextClass,
        )}
      >
        <span>文件名</span>
        <span>方向</span>
        <span>状态</span>
        <span>大小</span>
        <span className="text-right">更新时间</span>
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {entries.map(([name, status]) => (
          <div
            key={name}
            className="grid grid-cols-5 px-4 py-3 items-center text-sm"
          >
            <div
              className={classNames("truncate", themeColors.activeTextClass)}
              title={name}
            >
              {name}
            </div>
            <div className={classNames("text-xs", themeColors.textClass)}>
              {directionText(status.syncDirection)}
            </div>
            <div>
              <span
                className={classNames(
                  "text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1",
                  statusBadge(status.syncStatus),
                )}
              >
                {status.syncStatus === ResourceSyncStatus.Syncing &&
                  syncing && (
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  )}
                {status.syncStatus === ResourceSyncStatus.Pending && (
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                )}
                {status.syncStatus === ResourceSyncStatus.Synced && (
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                )}
                {status.syncStatus === ResourceSyncStatus.Error && (
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                )}
                {
                  {
                    pending: "待同步",
                    syncing: "同步中",
                    synced: "已同步",
                    error: "失败",
                  }[status.syncStatus]
                }
              </span>
              {status.errorMessage && (
                <div
                  className={classNames(
                    "text-xs mt-1 line-clamp-1",
                    themeColors.secondaryTextClass,
                  )}
                  title={status.errorMessage}
                >
                  {status.errorMessage}
                </div>
              )}
            </div>
            <div className={classNames("text-xs", themeColors.textClass)}>
              {formatSize(status.fileSize)}
            </div>
            <div
              className={classNames(
                "text-xs text-right",
                themeColors.secondaryTextClass,
              )}
            >
              {status.lastSyncTime
                ? dayjs(status.lastSyncTime).format("MM-DD HH:mm")
                : "-"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResourceSyncFileList;
