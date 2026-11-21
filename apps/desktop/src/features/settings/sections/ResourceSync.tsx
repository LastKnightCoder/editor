/** 文件传输、逐项结果与排除名单共享同一份资源账本。 */

import { useMemo, useState } from "react";
import dayjs from "dayjs";
import clsx from "clsx";
import {
  LoaderCircle,
  ArrowDown,
  ArrowUp,
  File as FileIcon,
  FolderSync,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import {
  ROW_DIVIDER,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  Panel,
  ProgressStatus,
  Segmented,
  toast,
  useEdgeFade,
} from "@tau/ui";
import { ResourceSyncStatus } from "@/types";
import type { IFileSyncStatus } from "@/types";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";
import { SyncActions, SyncStats } from "../components/SyncCard";
import type { FileFilter, ResourceSyncModel } from "./useResourceSyncModel";

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
  upload: "上传",
  download: "下载",
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
      return status.syncDirection === filter;
    case "error":
      return status.syncStatus === ResourceSyncStatus.Error;
    default:
      return true;
  }
}

export function ResourceSyncCard({
  model,
  ready,
  onSync,
}: {
  model: ResourceSyncModel;
  ready: boolean;
  onSync: () => void;
}) {
  const { progress, statusFile, isSyncing, counts } = model;
  const scanning = isSyncing && progress.status !== "syncing";
  const chip =
    isSyncing || model.refreshing ? (
      <StatusChip tone="accent">
        {model.stopping ? "正在停止" : model.refreshing ? "检查中" : scanning ? "比对中" : "传输中"}
      </StatusChip>
    ) : progress.status === "cancelled" ? (
      <StatusChip>已停止</StatusChip>
    ) : counts.error || progress.status === "error" || model.readError ? (
      <StatusChip tone="danger">{counts.error ? `${counts.error} 个失败` : "同步异常"}</StatusChip>
    ) : counts.pending ? (
      <StatusChip>{counts.pending} 个待同步</StatusChip>
    ) : progress.status === "completed" || statusFile?.lastSyncTime ? (
      <StatusChip tone="ok">已同步</StatusChip>
    ) : (
      <StatusChip>未同步</StatusChip>
    );

  return (
    <Panel pad="none" className="flex min-w-0 flex-col rounded-[14px] px-4 pt-4 pb-3.5">
      <div className="text-tau-body-lg flex items-center gap-2 font-semibold">
        <FolderSync size={15} strokeWidth={1.75} className="text-ink-2" />
        资源文件
        <span className="ml-auto font-normal">{chip}</span>
      </div>
      <div
        role="status"
        className="text-tau-meta text-ink-2 mt-1 flex min-w-0 items-center gap-1.5"
      >
        {scanning || model.refreshing ? (
          <>
            <LoaderCircle size={13} className="shrink-0 animate-spin" />
            正在比对本地与云端文件
          </>
        ) : (
          <span className="truncate" title={progress.currentFile ?? undefined}>
            {model.readError ||
              progress.message ||
              progress.currentFile ||
              (statusFile?.lastSyncTime
                ? `最近同步 ${formatSyncTime(statusFile.lastSyncTime)}`
                : "resources/")}
          </span>
        )}
      </div>
      {progress.status === "syncing" && progress.totalFiles > 0 ? (
        <ProgressStatus
          className="mt-3"
          value={(100 * progress.processedFiles) / progress.totalFiles}
          label={`已处理 ${progress.processedFiles} / ${progress.totalFiles} 个文件`}
        />
      ) : (
        !scanning &&
        !model.refreshing && (
          <SyncStats
            items={[
              { label: "已上传", value: counts.uploaded },
              { label: "已下载", value: counts.downloaded },
              { label: "跳过", value: counts.skipped },
              {
                label: "失败",
                value: counts.error,
                valueClassName: counts.error > 0 && "text-danger",
              },
            ]}
          />
        )
      )}
      <SyncActions>
        <Button
          variant="primary"
          size="sm"
          icon={RefreshCw}
          loading={isSyncing}
          loadingText={scanning ? "比对中…" : "同步中…"}
          disabled={!ready || isSyncing || model.refreshing}
          onClick={onSync}
        >
          {counts.error > 0 ? "重试失败" : "同步"}
        </Button>
        {isSyncing && (
          <Button
            variant="secondary"
            size="sm"
            icon={Square}
            disabled={model.stopping}
            onClick={() => void model.handleCancel()}
          >
            {model.stopping ? "正在停止…" : "停止"}
          </Button>
        )}
        {!isSyncing && (
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            disabled={!ready || model.refreshing}
            onClick={() => void model.handleRefresh()}
          >
            {model.refreshing ? "检查中…" : "重新比对"}
          </Button>
        )}
      </SyncActions>
    </Panel>
  );
}

export function ResourceSyncFiles({
  model,
  filter,
  ready,
  onFilterChange,
}: {
  model: ResourceSyncModel;
  filter: FileFilter;
  ready: boolean;
  onFilterChange: (filter: FileFilter) => void;
}) {
  const { entries, counts, blacklist, isSyncing } = model;
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(listEl);

  const [showSkipped, setShowSkipped] = useState(false);
  const filtered = useMemo(
    () =>
      entries.filter(
        ([, status]) =>
          (status.syncDirection !== null || status.syncStatus !== ResourceSyncStatus.Synced) &&
          matchFilter(status, filter)
      ),
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
      <SettingsGroup title="文件明细">
        {isSyncing && model.progress.status !== "syncing" ? (
          <div className="text-tau-meta text-ink-2 px-3 py-4">比对完成后将在这里列出文件</div>
        ) : entries.length === 0 ? (
          <div className="text-tau-meta text-ink-2 px-3 py-4">
            {model.progress.status === "completed" ? "本次没有需要传输的文件" : "暂无文件明细"}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 p-2">
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
            </div>
            <div
              ref={setListEl}
              className="edge-fade-scroll max-h-[360px] overflow-x-hidden overflow-y-auto"
            >
              {filtered.map(([name, status]) => (
                <FileRow
                  key={name}
                  name={name}
                  status={status}
                  onRetry={
                    ready && !isSyncing && !model.refreshing
                      ? () => {
                          onFilterChange("all");
                          void model.handleSync(name);
                        }
                      : undefined
                  }
                />
              ))}
              {filter === "all" && counts.skipped > 0 ? (
                <details open={showSkipped} onToggle={e => setShowSkipped(e.currentTarget.open)}>
                  <summary className="text-tau-sm text-ink-2 cursor-pointer px-3 py-2">
                    跳过 {counts.skipped} 个两端已有的文件
                  </summary>
                  {showSkipped &&
                    entries
                      .filter(([, file]) => file.syncDirection === null)
                      .map(([name, status]) => <FileRow key={name} name={name} status={status} />)}
                </details>
              ) : (
                filtered.length === 0 && (
                  <div className="text-tau-meta text-ink-2 px-3 py-4">当前筛选条件下没有文件</div>
                )
              )}
            </div>
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
                className="bg-hover text-ink-2 font-tau-mono inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-[12px]"
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
        <DialogBody>
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
        </DialogBody>
      </Dialog>
    </>
  );
}

function FileRow({
  name,
  status,
  onRetry,
}: {
  name: string;
  status: IFileSyncStatus;
  onRetry?: () => void;
}) {
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
      {status.syncDirection && (
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
        {status.syncStatus === ResourceSyncStatus.Synced
          ? status.syncDirection === "upload"
            ? "已上传"
            : status.syncDirection === "download"
              ? "已下载"
              : "已跳过"
          : FILE_STATUS_TEXTS[status.syncStatus]}
      </StatusChip>
      {isError && onRetry && (
        <Button size="sm" variant="secondary" aria-label={`重试 ${name}`} onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  );
}
