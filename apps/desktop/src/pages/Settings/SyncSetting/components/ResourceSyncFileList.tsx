import { useMemo, useState } from "react";
import classNames from "classnames";
import dayjs from "dayjs";
import { Paperclip } from "lucide-react";
import { ISyncStatusFile, ResourceSyncStatus, IResourceSyncBlacklistItem } from "@/types";
import useThemeColors from "@/hooks/useThemeColors";
import { SettingButton } from "../../components";
import ResourceThumbnail, { ResourcePreviewItem } from "./ResourceThumbnail";

type FilterKey = "all" | "upload" | "download" | "error";

interface ResourceSyncFileListProps {
  statusFile: ISyncStatusFile | null;
  syncing: boolean;
  blacklist: IResourceSyncBlacklistItem[];
  blacklistLoading?: boolean;
  onManageBlacklist: () => void;
  onRemoveBlacklistItem: (fileName: string) => void | Promise<void>;
  onPreviewFile?: (fileName: string) => void | Promise<void>;
  getPreviewResource?: (fileName: string) => ResourcePreviewItem | null;
}

const statusBadge = (status: ResourceSyncStatus) => {
  switch (status) {
    case ResourceSyncStatus.Syncing:
      return "text-status-info bg-[var(--th-info)]/10 border-[var(--th-info)]/30";
    case ResourceSyncStatus.Synced:
      return "text-status-success bg-[var(--th-success)]/10 border-[var(--th-success)]/30";
    case ResourceSyncStatus.Error:
      return "text-status-error bg-[var(--th-danger)]/10 border-[var(--th-danger)]/30";
    default:
      return "text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-200 dark:bg-zinc-900/40 dark:border-slate-800";
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
  blacklist,
  blacklistLoading,
  onManageBlacklist,
  onRemoveBlacklistItem,
  onPreviewFile,
  getPreviewResource,
}: ResourceSyncFileListProps) => {
  const themeColors = useThemeColors();
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const entries = Object.entries(statusFile?.files || {}).sort(([aKey, a], [bKey, b]) => {
    const orderDiff = statusOrder[a.syncStatus] - statusOrder[b.syncStatus];
    if (orderDiff !== 0) return orderDiff;
    return aKey.localeCompare(bKey);
  });

  const filterMap: Record<FilterKey, (entry: (typeof entries)[number]) => boolean> = {
    all: () => true,
    upload: ([, status]) =>
      status.syncDirection === "upload" && status.syncStatus !== ResourceSyncStatus.Synced,
    download: ([, status]) =>
      status.syncDirection === "download" && status.syncStatus !== ResourceSyncStatus.Synced,
    error: ([, status]) => status.syncStatus === ResourceSyncStatus.Error,
  };

  const tabConfigs: { key: FilterKey; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "upload", label: "待上传" },
    { key: "download", label: "待下载" },
    { key: "error", label: "需重传" },
  ];

  const tabCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      all: entries.length,
      upload: 0,
      download: 0,
      error: 0,
    };
    entries.forEach(entry => {
      if (filterMap.upload(entry)) counts.upload += 1;
      if (filterMap.download(entry)) counts.download += 1;
      if (filterMap.error(entry)) counts.error += 1;
    });
    return counts;
  }, [entries]);

  const filteredEntries = entries.filter(filterMap[activeFilter]);

  if (!entries.length) {
    return (
      <div className={classNames("bg-transparent text-sm", themeColors.secondaryTextClass)}>
        暂无资源同步记录，点击上方「开始」即可同步 resources 文件夹。
      </div>
    );
  }

  return (
    <div
      className={classNames(
        "rounded-2xl border border-[#f0f0f0] bg-transparent p-6 dark:border-[#2a2a2a]"
      )}
    >
      <div className="flex flex-col gap-3 border-b border-slate-200/70 py-3 dark:border-slate-800/60">
        <div className="flex flex-wrap items-center gap-2">
          {tabConfigs.map(tab => (
            <button
              key={tab.key}
              className={classNames(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                activeFilter === tab.key
                  ? "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100"
                  : themeColors.cardBorderClass
              )}
              onClick={() => setActiveFilter(tab.key)}
            >
              {tab.label}
              <span className="ml-1 text-[11px]">{tabCounts[tab.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className={classNames("text-xs", themeColors.secondaryTextClass)}>
            {filteredEntries.length > 0
              ? `共 ${filteredEntries.length} 个文件`
              : "当前筛选没有匹配的文件"}
          </div>
          <SettingButton
            variant="secondary"
            className="px-3! py-1.5! text-xs"
            onClick={onManageBlacklist}
            loading={blacklistLoading}
          >
            管理黑名单
          </SettingButton>
        </div>
      </div>
      <div
        className={classNames(
          "border-r-36 mt-2 grid grid-cols-[2fr_repeat(4,1fr)] border-transparent py-3 text-xs font-medium",
          themeColors.secondaryTextClass
        )}
      >
        <span>文件名</span>
        <span>方向</span>
        <span>状态</span>
        <span>大小</span>
        <span className="text-right">更新时间</span>
      </div>
      <div className="max-h-96 divide-y divide-slate-200 overflow-auto dark:divide-slate-800">
        {filteredEntries.map(([name, status]) => {
          const previewResource = getPreviewResource?.(name) ?? null;
          const handlePreview = () => {
            onPreviewFile?.(name);
          };
          return (
            <div
              key={name}
              className="border-r-20 grid grid-cols-[2fr_repeat(4,1fr)] items-center gap-3 border-transparent py-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                {previewResource ? (
                  <ResourceThumbnail
                    resource={previewResource}
                    onImageClick={handlePreview}
                    onVideoClick={handlePreview}
                    onAudioClick={handlePreview}
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800">
                    <Paperclip className="h-5 w-5 text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className={classNames("truncate")} title={name}>
                    {name}
                  </div>
                  {onPreviewFile && previewResource && (
                    <div className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">
                      点击缩略图即可预览
                    </div>
                  )}
                </div>
              </div>
              <div className={classNames("text-xs", themeColors.textClass)}>
                {directionText(status.syncDirection)}
              </div>
              <div>
                <span
                  className={classNames(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                    statusBadge(status.syncStatus)
                  )}
                >
                  {status.syncStatus === ResourceSyncStatus.Syncing && syncing && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  )}
                  {status.syncStatus === ResourceSyncStatus.Pending && (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  )}
                  {status.syncStatus === ResourceSyncStatus.Synced && (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                  )}
                  {status.syncStatus === ResourceSyncStatus.Error && (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
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
                      "mt-1 line-clamp-1 text-xs",
                      themeColors.secondaryTextClass
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
              <div className={classNames("text-right text-xs", themeColors.secondaryTextClass)}>
                {status.lastSyncTime ? dayjs(status.lastSyncTime).format("MM-DD HH:mm") : "-"}
              </div>
            </div>
          );
        })}
        {!filteredEntries.length && (
          <div
            className={classNames("px-4 py-6 text-center text-xs", themeColors.secondaryTextClass)}
          >
            当前筛选条件下没有待显示的文件
          </div>
        )}
      </div>
      {blacklist.length > 0 && (
        <div className="border-t border-slate-200/70 px-4 py-3 dark:border-slate-800/60">
          <div
            className={classNames(
              "mb-2 flex items-center justify-between text-xs",
              themeColors.secondaryTextClass
            )}
          >
            <span>已加入黑名单（不同步）</span>
            <span>{blacklist.length} 个</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {blacklist.map(item => (
              <button
                key={item.id}
                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs transition hover:border-red-200 hover:text-red-500 dark:border-slate-700 dark:bg-zinc-900/20"
                onClick={() => onRemoveBlacklistItem(item.fileName)}
                title="点击移出黑名单"
              >
                {item.fileName}
                <span className="ml-1 opacity-70">×</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceSyncFileList;
