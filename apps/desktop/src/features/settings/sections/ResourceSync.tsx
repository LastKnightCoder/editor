/**
 * 资源文件同步 —— 本地 resources 目录与云端双向镜像（本地多→上传、云端多→下载、同名跳过）。
 *
 * 归属「同步」子页（2026-09-24 第三版：原在资源存储页下半，与上传目标无关而与数据库同步
 * 共用远端，故迁入同步页）：概览 Tab 放状态卡（ResourceSyncCard），资源文件 Tab 放文件
 * 列表 + 黑名单（ResourceSyncFiles）。两处共享一个 useResourceSyncModel 实例，由
 * SyncSection 持有并下传，避免重复订阅进度。
 * 远端与凭据跟随同步存储配置；状态按提供商 + 配置哈希独立存档，换配置不串台。
 */

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  File as FileIcon,
  FolderSync,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  RotateCw,
  Square,
  X,
} from "lucide-react";
import { Button, Checkbox, Dialog, Panel, Segmented, toast, useEdgeFade } from "@tau/ui";
import { ResourceSyncStatus } from "@/types";
import type { IFileSyncStatus } from "@/types";
import { ROW_DIVIDER } from "../components/rowDivider";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";
import { pendingOf, type FileFilter, type ResourceSyncModel } from "./useResourceSyncModel";

const FILE_STATUS_TEXTS: Record<ResourceSyncStatus, string> = {
  [ResourceSyncStatus.Pending]: "待同步",
  [ResourceSyncStatus.Syncing]: "同步中",
  [ResourceSyncStatus.Synced]: "已同步",
  [ResourceSyncStatus.Error]: "需重传",
};

const FILE_STATUS_TONES = {
  [ResourceSyncStatus.Pending]: "neutral",
  [ResourceSyncStatus.Syncing]: "accent",
  [ResourceSyncStatus.Synced]: "ok",
  [ResourceSyncStatus.Error]: "danger",
} as const;

const FILE_FILTER_LABELS: Record<FileFilter, string> = {
  all: "全部",
  upload: "待上传",
  download: "待下载",
  error: "需重传",
};

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

const formatSyncTime = (time: number | null | undefined) =>
  time ? dayjs(time).format("MM-DD HH:mm") : "—";

const formatFileSize = (size: number | null | undefined) => {
  if (!size || size <= 0) return "—";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
};

function matchFilter(status: IFileSyncStatus, filter: FileFilter): boolean {
  switch (filter) {
    case "upload":
    case "download":
      return pendingOf(status, filter);
    case "error":
      return status.syncStatus === ResourceSyncStatus.Error;
    default:
      return true;
  }
}

/** 概览状态卡：进度 / 计数 / 动作（与数据库卡并排） */
export function ResourceSyncCard({
  model,
  onShowIssues,
}: {
  model: ResourceSyncModel;
  onShowIssues: () => void;
}) {
  const { progress, statusFile, isSyncing, counts } = model;
  const percent =
    progress.totalFiles > 0 ? Math.round((progress.processedFiles / progress.totalFiles) * 100) : 0;

  const chip = isSyncing ? (
    <StatusChip tone="accent">{progress.status === "scanning" ? "扫描中" : "同步中"}</StatusChip>
  ) : counts.error > 0 ? (
    <StatusChip tone="danger">{counts.error} 个失败</StatusChip>
  ) : statusFile?.lastSyncTime ? (
    <StatusChip tone="ok">已同步</StatusChip>
  ) : (
    <StatusChip>未同步</StatusChip>
  );

  return (
    <Panel pad="none" className="flex min-w-0 flex-col rounded-[14px] px-4 pb-3.5 pt-4">
      <div className="text-tau-body-lg flex items-center gap-2 font-semibold">
        <FolderSync size={15} strokeWidth={1.75} className="text-ink-2" />
        资源文件
        <span className="ml-auto font-normal">{chip}</span>
      </div>
      <div className="text-tau-meta text-ink-2 mt-0.5 truncate">
        {isSyncing && progress.currentFile
          ? `当前 ${progress.currentFile}`
          : `resources/ · ${
              statusFile?.lastSyncTime
                ? `最近同步 ${dayjs(statusFile.lastSyncTime).format("MM-DD HH:mm")}`
                : "暂无同步记录"
            }`}
      </div>

      {isSyncing ? (
        <>
          <div className="text-tau-sm text-ink-2 mb-1.5 mt-3.5 flex justify-between tabular-nums">
            <span>
              已处理 {progress.processedFiles} / {progress.totalFiles}
            </span>
            <span>{percent}%</span>
          </div>
          <div className="bg-sunken h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      ) : null}

      <dl className="mt-2.5 grid grid-cols-4">
        {(
          [
            ["文件", counts.all],
            ["待上传", counts.upload],
            ["待下载", counts.download],
            ["失败", counts.error],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-tau-sm text-ink-2">{label}</dt>
            <dd
              className={clsx(
                "text-tau-title font-semibold tabular-nums",
                label === "失败" && value > 0 && "text-danger"
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex gap-2 pt-3.5">
        {isSyncing ? (
          <Button
            variant="secondary"
            size="sm"
            icon={Square}
            onClick={() => void model.handleCancel()}
          >
            停止
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon={RefreshCw}
            onClick={() => void model.handleSync()}
          >
            {counts.error > 0 ? "重试失败" : "同步"}
          </Button>
        )}
        {counts.error > 0 && !isSyncing && (
          <Button variant="ghost" size="sm" icon={AlertTriangle} onClick={onShowIssues}>
            查看失败项
          </Button>
        )}
      </div>
    </Panel>
  );
}

/** 资源文件 Tab：筛选 + 文件列表 + 黑名单 */
export function ResourceSyncFiles({
  model,
  filter,
  onFilterChange,
}: {
  model: ResourceSyncModel;
  filter: FileFilter;
  onFilterChange: (filter: FileFilter) => void;
}) {
  const { entries, counts, blacklist, isSyncing } = model;
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(listEl);

  const filtered = useMemo(
    () => entries.filter(([, status]) => matchFilter(status, filter)),
    [entries, filter]
  );

  /* 加入黑名单弹层：候选 = 当前状态文件里的文件名，排除已在黑名单的 */
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const blacklistNames = useMemo(
    () => new Set(blacklist.items.map(item => item.fileName)),
    [blacklist.items]
  );
  const candidates = useMemo(
    () => entries.map(([name]) => name).filter(name => !blacklistNames.has(name)),
    [entries, blacklistNames]
  );

  const handleAddBlacklist = async () => {
    if (!selected.length) return;
    await blacklist.addItems(selected);
    toast.success(`已添加 ${selected.length} 个文件到黑名单`);
    setBlacklistOpen(false);
  };

  const handleRemoveBlacklist = async (fileName: string) => {
    await blacklist.removeItems({ fileNames: [fileName] });
    toast.success(`已移出黑名单：${fileName}`);
  };

  return (
    <>
      <SettingsGroup title="资源文件" description="本地 resources 文件夹与远端逐个比对">
        {entries.length === 0 ? (
          <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">
            暂无同步记录，在「概览」点击同步即可开始镜像 resources 目录
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 p-2">
              <Segmented
                label="文件筛选"
                size="sm"
                value={filter}
                onValueChange={v => onFilterChange(v as FileFilter)}
              >
                {(Object.keys(FILE_FILTER_LABELS) as FileFilter[]).map(key => (
                  <Segmented.Item
                    key={key}
                    value={key}
                    label={`${FILE_FILTER_LABELS[key]} ${counts[key]}`}
                  />
                ))}
              </Segmented>
              <span className="flex-1" />
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={() => void model.handleRefresh()}
              >
                刷新
              </Button>
              {counts.error > 0 && !isSyncing && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RotateCw}
                  onClick={() => void model.handleSync()}
                >
                  重试全部
                </Button>
              )}
            </div>
            {filtered.length === 0 ? (
              <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">
                当前筛选条件下没有文件
              </div>
            ) : (
              <div
                ref={setListEl}
                className="edge-fade-scroll max-h-[360px] overflow-y-auto overflow-x-hidden"
              >
                {filtered.map(([name, status]) => (
                  <FileRow key={name} name={name} status={status} />
                ))}
              </div>
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="黑名单"
        description="这些文件不参与同步"
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            disabled={candidates.length === 0}
            onClick={() => setBlacklistOpen(true)}
          >
            添加文件
          </Button>
        }
      >
        {blacklist.items.length === 0 ? (
          <div className="text-tau-meta text-ink-2 px-3 py-3">暂无文件</div>
        ) : (
          <div className="flex flex-wrap gap-1.5 p-2">
            {blacklist.items.map(item => (
              <span
                key={item.id}
                className="bg-hover text-ink-2 font-tau-mono inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[12px]"
              >
                {item.fileName}
                <button
                  type="button"
                  aria-label={`移出黑名单：${item.fileName}`}
                  className="text-ink-3 hover:bg-press hover:text-ink-1 grid size-[18px] place-items-center rounded-full"
                  onClick={() => void handleRemoveBlacklist(item.fileName)}
                >
                  <X size={11} strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
        )}
      </SettingsGroup>

      <Dialog
        open={blacklistOpen}
        onOpenChange={setBlacklistOpen}
        onAfterClose={() => setSelected([])}
        title="加入黑名单"
        subtitle="黑名单文件不参与资源目录同步"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setBlacklistOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!selected.length}
              onClick={() => void handleAddBlacklist()}
            >
              加入 {selected.length > 0 ? `(${selected.length})` : ""}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          {candidates.map(name => (
            <label
              key={name}
              className="border-line-2 flex items-center gap-2.5 border-b py-1.5 last:border-b-0"
            >
              <Checkbox
                checked={selected.includes(name)}
                onChange={e => {
                  setSelected(prev =>
                    e.target.checked ? [...prev, name] : prev.filter(item => item !== name)
                  );
                }}
              />
              <span className="font-tau-mono text-ink-1 min-w-0 flex-1 truncate text-[12px]">
                {name}
              </span>
            </label>
          ))}
        </div>
      </Dialog>
    </>
  );
}

function FileRow({ name, status }: { name: string; status: IFileSyncStatus }) {
  const isError = status.syncStatus === ResourceSyncStatus.Error;
  const Icon = IMAGE_EXT_RE.test(name) ? ImageIcon : FileIcon;
  return (
    <div
      className={clsx("rounded-tau-sm flex min-h-[52px] items-center gap-3 px-3 py-2", ROW_DIVIDER)}
    >
      <span className="bg-hover text-ink-2 rounded-tau-sm grid size-8 shrink-0 place-items-center">
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-ink-1 font-tau-mono truncate text-[12px]" title={name}>
          {name}
        </div>
        <div
          className="text-tau-meta text-ink-2 truncate"
          title={isError ? (status.errorMessage ?? undefined) : undefined}
        >
          {formatFileSize(status.fileSize)}
          {isError && status.errorMessage
            ? ` · ${status.errorMessage}`
            : ` · ${formatSyncTime(status.lastSyncTime)}`}
        </div>
      </div>
      {status.syncDirection && status.syncStatus !== ResourceSyncStatus.Synced && (
        <span
          className="text-ink-3 grid place-items-center"
          title={status.syncDirection === "upload" ? "上传" : "下载"}
        >
          {status.syncDirection === "upload" ? (
            <ArrowUp size={14} strokeWidth={1.75} />
          ) : (
            <ArrowDown size={14} strokeWidth={1.75} />
          )}
        </span>
      )}
      <StatusChip tone={FILE_STATUS_TONES[status.syncStatus]}>
        {FILE_STATUS_TEXTS[status.syncStatus]}
      </StatusChip>
    </div>
  );
}
