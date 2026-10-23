// 资源文件页：resources 目录与同步服务之间的双向镜像。状态卡 + 拇指区一个主按钮（同同步中心），
// 下方按「需要处理 / 待上传 / 待下载 / 全部」列出文件。进入与返回时静默刷新一次账本。

import { useEffect, useMemo, useState } from "react";
import {
  CircleCheck,
  Cloud,
  CloudOff,
  CloudUpload,
  File as FileIcon,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";
import type {
  ResourceSyncActionResponse,
  ResourceSyncProgress,
  ResourceSyncStatusFile,
} from "../../../types";
import { toast } from "../../../components/toast";
import { usePageLifecycle } from "../../../router";
import { parseInvokeError } from "../../../services/errors";
import type { SettingModuleKey } from "../components/types";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import {
  countResources,
  defaultResourceFilter,
  deriveResourceHero,
  filterResources,
  isResourceSyncRunning,
  type ResourceFilter,
  type ResourceHeroState,
} from "./resourceState";
import { resolveSyncErrorMessage } from "./syncErrors";
import { formatRelativeTime } from "./syncState";

const PAGE_SIZE = 30;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i;

const ORB_TONE: Record<ResourceHeroState["tone"], string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  run: "bg-info-soft text-info",
  error: "bg-danger-soft text-danger",
  idle: "bg-accent-soft text-accent-text",
};

const FILTER_LABELS: Record<ResourceFilter, string> = {
  error: "需要处理",
  upload: "待上传",
  download: "待下载",
  all: "全部",
};

function HeroIcon(props: { icon: ResourceHeroState["icon"] }) {
  const common = { size: 34, strokeWidth: 1.9, "aria-hidden": true } as const;
  switch (props.icon) {
    case "check":
      return <CircleCheck {...common} />;
    case "upload":
      return <CloudUpload {...common} />;
    case "sync":
      return <RefreshCw {...common} className="animate-spin [animation-duration:1.6s]" />;
    case "error":
      return <CloudOff {...common} />;
    default:
      return <Cloud {...common} />;
  }
}

function formatSize(size: number | null): string {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function baseName(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] || path;
}

export type ResourceFilesProps = {
  progress: ResourceSyncProgress;
  statusFile: ResourceSyncStatusFile | null;
  isSyncing: boolean;
  onRefresh: () => Promise<void>;
  onStart: () => Promise<ResourceSyncActionResponse>;
  onRetryFailed: () => Promise<ResourceSyncActionResponse>;
  onCancel: () => Promise<ResourceSyncActionResponse>;
  onOpenModule: (module: SettingModuleKey) => void;
};

export function ResourceFilesSection(props: ResourceFilesProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [configMissing, setConfigMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<ResourceFilter | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const running = props.isSyncing || isResourceSyncRunning(props.progress);
  const counts = useMemo(() => countResources(props.statusFile), [props.statusFile]);
  const activeFilter = filter ?? defaultResourceFilter(counts);
  const entries = useMemo(
    () => filterResources(props.statusFile, activeFilter),
    [props.statusFile, activeFilter]
  );

  const handleError = (error: unknown, fallback: string, silent: boolean) => {
    if (parseInvokeError(error).code === "RESOURCE_SYNC_CONFIG_MISSING") {
      setConfigMissing(true);
      return;
    }
    const message = resolveSyncErrorMessage(error, fallback);
    setErrorMessage(message);
    if (!silent) toast.error(message);
  };

  const refresh = async (options?: { silent?: boolean }) => {
    if (running) return;
    setBusy(true);
    try {
      await props.onRefresh();
      setErrorMessage(null);
      setConfigMissing(false);
    } catch (error) {
      handleError(error, "读取资源同步状态失败", Boolean(options?.silent));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  usePageLifecycle({ onResume: () => void refresh({ silent: true }) });

  const lastSyncTime = props.statusFile?.lastSyncTime;
  const hero = deriveResourceHero({
    progress: props.progress,
    counts,
    errorMessage,
    configMissing,
    lastSyncText: lastSyncTime ? formatRelativeTime(lastSyncTime, Date.now()) : null,
  });

  const runAction = async (action: () => Promise<ResourceSyncActionResponse>) => {
    setBusy(true);
    try {
      await action();
      setErrorMessage(null);
    } catch (error) {
      handleError(error, "资源同步执行失败", false);
    } finally {
      setBusy(false);
    }
  };

  const runPrimary = () => {
    switch (hero.primaryAction) {
      case "cancel":
        void runAction(props.onCancel);
        return;
      case "retry":
        void runAction(props.onRetryFailed);
        return;
      case "start":
        void runAction(props.onStart);
        return;
      case "configure":
        props.onOpenModule("database");
        return;
      default:
        void refresh();
    }
  };

  const filters = (["error", "upload", "download", "all"] as const).filter(
    key => key === "all" || counts[key] > 0
  );
  const percent =
    props.progress.totalFiles > 0
      ? Math.round((props.progress.processedFiles / props.progress.totalFiles) * 100)
      : 0;

  return (
    <div className="page-enter space-y-1">
      <section className="setting-group px-[18px] pb-4 pt-6 text-center">
        <span
          className={`mx-auto mb-3 grid h-[76px] w-[76px] place-items-center rounded-full ${ORB_TONE[hero.tone]}`}
        >
          <HeroIcon icon={hero.icon} />
        </span>
        <h2 className="text-ink-1 text-[21px] font-extrabold tracking-tight">{hero.title}</h2>
        <p className="text-ink-2 mt-1 text-[12.5px] leading-relaxed">{hero.description}</p>
        {running && props.progress.currentFile && (
          <p className="text-ink-3 mt-0.5 truncate text-[11.5px]">{props.progress.currentFile}</p>
        )}
        {running && (
          <div className="bg-line-1 mx-2 mt-3.5 h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </section>

      <div className="flex gap-2.5 pt-3">
        <ActionButton
          label={hero.primaryLabel}
          emphasis={hero.primaryEmphasis}
          busy={busy && !running}
          disabled={busy && hero.primaryAction !== "cancel"}
          onClick={runPrimary}
        />
      </div>

      {counts.total > 0 && !configMissing && (
        <>
          <div className="flex gap-1.5 overflow-x-auto px-0.5 pb-0.5 pt-4" role="tablist">
            {filters.map(key => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeFilter === key}
                onClick={() => {
                  setFilter(key);
                  setLimit(PAGE_SIZE);
                }}
                className={`h-[30px] shrink-0 rounded-full px-3 text-[12.5px] ${
                  activeFilter === key
                    ? "bg-accent-soft text-accent-text font-semibold"
                    : "bg-surface text-ink-2"
                }`}
              >
                {FILTER_LABELS[key]}{" "}
                <span className="tabular-nums opacity-75">
                  {key === "all" ? counts.total : counts[key]}
                </span>
              </button>
            ))}
          </div>
          <div className="pt-2">
            <GroupCard>
              {entries.slice(0, limit).map(([path, status]) => (
                <GroupRow key={path}>
                  <span className="bg-page text-ink-3 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
                    {IMAGE_EXT_RE.test(path) ? (
                      <ImageIcon size={16} aria-hidden="true" />
                    ) : (
                      <FileIcon size={16} aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-1 block truncate text-[14px] font-medium">
                      {baseName(path)}
                    </span>
                    <span
                      className={`block truncate text-[11.5px] ${status.syncStatus === "error" ? "text-danger" : "text-ink-3"}`}
                    >
                      {status.syncStatus === "error"
                        ? [
                            status.errorMessage || "同步失败",
                            status.retryCount > 0 ? `已重试 ${status.retryCount} 次` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : [
                            formatSize(status.fileSize),
                            status.syncStatus === "synced"
                              ? "已同步"
                              : status.syncDirection === "download"
                                ? "待下载"
                                : "待上传",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                  </span>
                </GroupRow>
              ))}
              {entries.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit(value => value + PAGE_SIZE)}
                  className="text-accent-text active:bg-hover h-12 w-full text-[14px] font-semibold"
                >
                  显示更多（还有 {entries.length - limit} 个）
                </button>
              )}
            </GroupCard>
          </div>
        </>
      )}
      <GroupNote>资源同步只增不删：本机删掉的文件不会从云端删除。</GroupNote>
    </div>
  );
}
