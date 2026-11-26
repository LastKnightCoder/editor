/** 文件传输、逐项结果与排除名单共享同一份资源账本。 */

import {
  syncTranslator,
  useSyncI18n,
  syncCount,
  syncDisplayContext,
  type SyncMessageKey,
} from "../sync/i18n";
import { useMemo, useState } from "react";
import { formatSyncTime, formatSyncFileSize } from "../sync/format";
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

const FILE_STATUS_TEXTS: Record<ResourceSyncStatus, SyncMessageKey> = {
  [ResourceSyncStatus.Pending]: "status.pending",
  [ResourceSyncStatus.Syncing]: "status.syncing",
  [ResourceSyncStatus.Synced]: "status.synced",
  [ResourceSyncStatus.Error]: "status.retry",
};

const FILE_STATUS_TONES = {
  [ResourceSyncStatus.Pending]: "neutral",
  [ResourceSyncStatus.Syncing]: "accent",
  [ResourceSyncStatus.Synced]: "ok",
  [ResourceSyncStatus.Error]: "danger",
} as const;

const FILE_FILTER_LABELS: Record<FileFilter, SyncMessageKey> = {
  all: "filter.all",
  upload: "action.upload",
  download: "action.download",
  error: "status.retry",
};

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

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
  useSyncI18n();
  const { progress, statusFile, isSyncing, counts } = model;
  const scanning = isSyncing && progress.status !== "syncing";
  const chip =
    isSyncing || model.refreshing ? (
      <StatusChip tone="accent">
        {model.stopping
          ? syncTranslator.t("status.stopping")
          : model.refreshing
            ? syncTranslator.t("status.checking")
            : scanning
              ? syncTranslator.t("status.scanning")
              : syncTranslator.t("status.transferring")}
      </StatusChip>
    ) : progress.status === "cancelled" ? (
      <StatusChip>{syncTranslator.t("status.stopped")}</StatusChip>
    ) : counts.error || progress.status === "error" || model.readError ? (
      <StatusChip tone="danger">
        {counts.error ? syncCount("count.failed", counts.error) : syncTranslator.t("status.error")}
      </StatusChip>
    ) : counts.pending ? (
      <StatusChip>{syncCount("count.pending", counts.pending)}</StatusChip>
    ) : progress.status === "completed" || statusFile?.lastSyncTime ? (
      <StatusChip tone="ok">{syncTranslator.t("status.synced")}</StatusChip>
    ) : (
      <StatusChip>{syncTranslator.t("status.notSynced")}</StatusChip>
    );

  return (
    <Panel pad="none" className="flex min-w-0 flex-col rounded-[14px] px-4 pt-4 pb-3.5">
      <div className="text-tau-body-lg flex items-center gap-2 font-semibold">
        <FolderSync size={15} strokeWidth={1.75} className="text-ink-2" />
        {syncTranslator.t("resource.title")}
        <span className="ml-auto font-normal">{chip}</span>
      </div>
      <div
        role="status"
        className="text-tau-meta text-ink-2 mt-1 flex min-w-0 items-center gap-1.5"
      >
        {scanning || model.refreshing ? (
          <>
            <LoaderCircle size={13} className="shrink-0 animate-spin" />
            {syncTranslator.t("resource.comparing")}
          </>
        ) : (
          <span className="truncate" title={progress.currentFile ?? undefined}>
            {model.readError ||
              progress.message ||
              progress.currentFile ||
              (statusFile?.lastSyncTime
                ? syncTranslator.t("resource.recent", {
                    time: formatSyncTime(statusFile.lastSyncTime, syncDisplayContext().locale),
                  })
                : "resources/")}
          </span>
        )}
      </div>
      {progress.status === "syncing" && progress.totalFiles > 0 ? (
        <ProgressStatus
          className="mt-3"
          value={(100 * progress.processedFiles) / progress.totalFiles}
          label={syncTranslator.t("resource.processed", {
            processed: progress.processedFiles,
            total: progress.totalFiles,
          })}
        />
      ) : (
        !scanning &&
        !model.refreshing && (
          <SyncStats
            items={[
              {
                id: "uploaded",
                label: syncTranslator.t("status.uploaded"),
                value: counts.uploaded,
              },
              {
                id: "downloaded",
                label: syncTranslator.t("status.downloaded"),
                value: counts.downloaded,
              },
              { id: "skipped", label: syncTranslator.t("status.skipped"), value: counts.skipped },
              {
                id: "error",
                label: syncTranslator.t("status.failed"),
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
          loadingText={
            scanning ? syncTranslator.t("action.scanning") : syncTranslator.t("action.syncing")
          }
          disabled={!ready || isSyncing || model.refreshing}
          onClick={onSync}
        >
          {counts.error > 0
            ? syncTranslator.t("action.retryFailed")
            : syncTranslator.t("action.sync")}
        </Button>
        {isSyncing && (
          <Button
            variant="secondary"
            size="sm"
            icon={Square}
            disabled={model.stopping}
            onClick={() => void model.handleCancel()}
          >
            {model.stopping ? syncTranslator.t("action.stopping") : syncTranslator.t("action.stop")}
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
            {model.refreshing
              ? syncTranslator.t("action.checking")
              : syncTranslator.t("action.compareAgain")}
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
  useSyncI18n();
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
    toast.success(syncCount("exclude.added", selected.length));
    setBlacklistOpen(false);
  };

  const handleRemoveBlacklist = async (fileName: string) => {
    await blacklist.removeItems({ fileNames: [fileName] });
    toast.success(syncTranslator.t("exclude.removed", { name: fileName }));
  };

  return (
    <>
      <SettingsGroup title={syncTranslator.t("files.title")}>
        {isSyncing && model.progress.status !== "syncing" ? (
          <div className="text-tau-meta text-ink-2 px-3 py-4">
            {syncTranslator.t("files.afterComparison")}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-tau-meta text-ink-2 px-3 py-4">
            {model.progress.status === "completed"
              ? syncTranslator.t("files.noTransfer")
              : syncTranslator.t("files.noDetails")}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 p-2">
              <Segmented
                label={syncTranslator.t("files.filter")}
                size="sm"
                value={filter}
                onValueChange={v => onFilterChange(v as FileFilter)}
              >
                {(Object.keys(FILE_FILTER_LABELS) as FileFilter[]).map(key => (
                  <Segmented.Item
                    key={key}
                    value={key}
                    label={`${syncTranslator.t(FILE_FILTER_LABELS[key])} ${counts[key].toLocaleString(syncDisplayContext().locale)}`}
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
                    {syncCount("resource.skipped", counts.skipped)}
                  </summary>
                  {showSkipped &&
                    entries
                      .filter(([, file]) => file.syncDirection === null)
                      .map(([name, status]) => <FileRow key={name} name={name} status={status} />)}
                </details>
              ) : (
                filtered.length === 0 && (
                  <div className="text-tau-meta text-ink-2 px-3 py-4">
                    {syncTranslator.t("files.noMatch")}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title={syncTranslator.t("exclude.title")}
        description={syncTranslator.t("exclude.description")}
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            disabled={candidates.length === 0}
            onClick={() => setBlacklistOpen(true)}
          >
            {syncTranslator.t("exclude.add")}
          </Button>
        }
      >
        {blacklist.items.length === 0 ? (
          <div className="text-tau-meta text-ink-2 px-3 py-3">
            {syncTranslator.t("files.empty")}
          </div>
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
                  aria-label={syncTranslator.t("exclude.removeAria", { name: item.fileName })}
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
        title={syncTranslator.t("exclude.dialogTitle")}
        subtitle={syncTranslator.t("exclude.hint")}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setBlacklistOpen(false)}>
              {syncTranslator.t("action.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!selected.length}
              onClick={() => void handleAddBlacklist()}
            >
              {syncTranslator.t("action.add")}
              {selected.length > 0 ? `(${selected.length})` : ""}
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
  useSyncI18n();
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
          {formatSyncFileSize(status.fileSize, syncDisplayContext().locale)}
          {isError && status.errorMessage
            ? ` · ${status.errorMessage}`
            : ` · ${formatSyncTime(status.lastSyncTime, syncDisplayContext().locale)}`}
        </div>
      </div>
      {status.syncDirection && (
        <span
          className="text-ink-3 grid place-items-center"
          title={
            status.syncDirection === "upload"
              ? syncTranslator.t("action.upload")
              : syncTranslator.t("action.download")
          }
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
            ? syncTranslator.t("status.uploaded")
            : status.syncDirection === "download"
              ? syncTranslator.t("status.downloaded")
              : syncTranslator.t("status.wasSkipped")
          : syncTranslator.t(FILE_STATUS_TEXTS[status.syncStatus])}
      </StatusChip>
      {isError && onRetry && (
        <Button
          size="sm"
          variant="secondary"
          aria-label={syncTranslator.t("files.retryAria", { name: name })}
          onClick={onRetry}
        >
          {syncTranslator.t("action.retry")}
        </Button>
      )}
    </div>
  );
}
