import { useMemo, useState } from "react";
import classNames from "classnames";
import dayjs from "dayjs";
import { Paperclip } from "lucide-react";
import {
  ISyncStatusFile,
  ResourceSyncStatus,
  IResourceSyncBlacklistItem,
} from "@/types";
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
      return "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-200 dark:bg-blue-900/30 dark:border-blue-900/50";
    case ResourceSyncStatus.Synced:
      return "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-900/50";
    case ResourceSyncStatus.Error:
      return "text-red-600 bg-red-50 border-red-200 dark:text-red-200 dark:bg-red-900/30 dark:border-red-900/50";
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

  const entries = Object.entries(statusFile?.files || {}).sort(
    ([aKey, a], [bKey, b]) => {
      const orderDiff = statusOrder[a.syncStatus] - statusOrder[b.syncStatus];
      if (orderDiff !== 0) return orderDiff;
      return aKey.localeCompare(bKey);
    },
  );

  const filterMap: Record<
    FilterKey,
    (entry: (typeof entries)[number]) => boolean
  > = {
    all: () => true,
    upload: ([, status]) =>
      status.syncDirection === "upload" &&
      status.syncStatus !== ResourceSyncStatus.Synced,
    download: ([, status]) =>
      status.syncDirection === "download" &&
      status.syncStatus !== ResourceSyncStatus.Synced,
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
    entries.forEach((entry) => {
      if (filterMap.upload(entry)) counts.upload += 1;
      if (filterMap.download(entry)) counts.download += 1;
      if (filterMap.error(entry)) counts.error += 1;
    });
    return counts;
  }, [entries]);

  const filteredEntries = entries.filter(filterMap[activeFilter]);

  if (!entries.length) {
    return (
      <div
        className={classNames(
          "text-sm bg-transparent",
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
        "p-6 bg-transparent rounded-2xl border border-[#f0f0f0] dark:border-[#2a2a2a]",
      )}
    >
      <div className="flex flex-col gap-3 border-b border-slate-200/70 dark:border-slate-800/60 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {tabConfigs.map((tab) => (
            <button
              key={tab.key}
              className={classNames(
                "px-3 py-1 rounded-full text-xs font-medium border transition",
                activeFilter === tab.key
                  ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-100"
                  : themeColors.cardBorderClass,
              )}
              onClick={() => setActiveFilter(tab.key)}
            >
              {tab.label}
              <span className="ml-1 text-[11px]">
                {tabCounts[tab.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div
            className={classNames("text-xs", themeColors.secondaryTextClass)}
          >
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
          "grid grid-cols-[2fr_repeat(4,1fr)] py-3 mt-2 text-xs font-medium border-r-36 border-transparent",
          themeColors.secondaryTextClass,
        )}
      >
        <span>文件名</span>
        <span>方向</span>
        <span>状态</span>
        <span>大小</span>
        <span className="text-right">更新时间</span>
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-96 overflow-auto">
        {filteredEntries.map(([name, status]) => {
          const previewResource = getPreviewResource?.(name) ?? null;
          const handlePreview = () => {
            onPreviewFile?.(name);
          };
          return (
            <div
              key={name}
              className="grid grid-cols-[2fr_repeat(4,1fr)] py-3 items-center text-sm gap-3 border-r-20 border-transparent"
            >
              <div className="flex items-center gap-3 min-w-0">
                {previewResource ? (
                  <ResourceThumbnail
                    resource={previewResource}
                    onImageClick={handlePreview}
                    onVideoClick={handlePreview}
                    onAudioClick={handlePreview}
                  />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    <Paperclip className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className={classNames("truncate")} title={name}>
                    {name}
                  </div>
                  {onPreviewFile && previewResource && (
                    <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
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
          );
        })}
        {!filteredEntries.length && (
          <div
            className={classNames(
              "px-4 py-6 text-center text-xs",
              themeColors.secondaryTextClass,
            )}
          >
            当前筛选条件下没有待显示的文件
          </div>
        )}
      </div>
      {blacklist.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-200/70 dark:border-slate-800/60">
          <div
            className={classNames(
              "text-xs mb-2 flex items-center justify-between",
              themeColors.secondaryTextClass,
            )}
          >
            <span>已加入黑名单（不同步）</span>
            <span>{blacklist.length} 个</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {blacklist.map((item) => (
              <button
                key={item.id}
                className="text-xs px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-zinc-900/20 hover:border-red-200 hover:text-red-500 transition"
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
