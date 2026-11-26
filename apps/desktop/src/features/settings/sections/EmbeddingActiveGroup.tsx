/**
 * 嵌入模型 · 当前生效组 —— 首行是当前生效模型（或未启用空态），其后是主内容
 * （卡片 / 文章 / 项目文档 / 日记）向量索引覆盖情况。
 *
 * 索引不是实时的：本地模型在启动、同步后、切换模型时由后台补齐，编辑内容后停止写入
 * 一段时间（IDLE_INDEX_DELAY_MS）再增量补索引；插件模型不自动索引。
 * 这里展示「总数 / 已索引 / 待更新 / 未索引」、进行中的进度与上一轮记录，并支持手动发起
 * 一轮增量索引（只处理未索引与内容有更新的文档）。
 */

import { embeddingText, embeddingValue, useEmbeddingSettingsI18n } from "./EmbeddingSection.i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDashed, Play, RefreshCw } from "lucide-react";
import { ROW_DIVIDER, SettingRow, Button, toast } from "@tau/ui";
import type { EmbeddingActiveModel } from "@/types/embedding";
import {
  getEmbeddingIndexStatus,
  onEmbeddingIndexProgress,
  startEmbeddingIndex,
  type EmbeddingIndexContentType,
  type EmbeddingIndexProgress,
  type EmbeddingIndexStatus,
} from "@/commands";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";

const TYPE_LABELS: Record<EmbeddingIndexContentType, string> = {
  get card() {
    return embeddingText("ui.cards");
  },
  get article() {
    return embeddingText("ui.articles");
  },
  get "project-item"() {
    return embeddingText("ui.projectDocuments");
  },
  get "diary-moment"() {
    return embeddingText("ui.diary");
  },
  get excerpt() {
    return embeddingText("ui.highlights");
  },
  get "pdf-annotation"() {
    return embeddingText("ui.pdfAnnotations");
  },
  get "web-clip"() {
    return embeddingText("ui.webClips");
  },
  get "plugin-entity"() {
    return embeddingText("ui.pluginContent");
  },
};

const REASON_LABELS: Record<string, string> = {
  get manual() {
    return embeddingText("ui.manual");
  },
  get content_idle() {
    return embeddingText("ui.afterEditing");
  },
  get startup_reconcile() {
    return embeddingText("ui.atStartup");
  },
  get db_switch() {
    return embeddingText("ui.databaseChange");
  },
  get config_switch() {
    return embeddingText("ui.configurationChange");
  },
  get model_switch() {
    return embeddingText("ui.modelChange");
  },
  get sync_upload_reconnect() {
    return embeddingText("ui.afterSyncUpload");
  },
  get sync_download_reconnect() {
    return embeddingText("ui.afterSyncDownload");
  },
};

const formatTime = (ts: number | undefined, locale: string) =>
  !ts
    ? "—"
    : new Intl.DateTimeFormat(locale, {
        month: "numeric",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(ts);

const formatDuration = (run: EmbeddingIndexProgress, locale: string, t: typeof embeddingText) => {
  if (!run.finishedAt) return "";
  const seconds = Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000));
  const numbers = new Intl.NumberFormat(locale, { useGrouping: false });
  return seconds < 60
    ? t("duration.seconds", { seconds: numbers.format(seconds) })
    : t("duration.minutesSeconds", {
        minutes: numbers.format(Math.floor(seconds / 60)),
        seconds: numbers.format(seconds % 60),
      });
};

export function EmbeddingActiveGroup({
  active,
  label,
  subtitle,
}: {
  active: EmbeddingActiveModel | null;
  /** 当前模型显示名（本地取本地列表 label，插件取声明目录 label，兜底 id） */
  label: string;
  /** 来源摘要：「内置 · 本地模型 · N 维」/「插件 · 提供方 · N 维」 */
  subtitle: string;
}) {
  const { locale, t } = useEmbeddingSettingsI18n();

  const [status, setStatus] = useState<EmbeddingIndexStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState<EmbeddingIndexProgress | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getEmbeddingIndexStatus();
      if (!mountedRef.current) return;
      setStatus(next);
      setRunning(next.running);
    } catch (error) {
      if (mountedRef.current) {
        toast.error(
          embeddingText("message.couldNotLoadIndexStatus", {
            error: embeddingValue(error instanceof Error ? error.message : String(error)),
          })
        );
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 模型切换后重新统计（切换会触发后台重建）
  const modelKey = active ? `${active.provider}:${active.pluginId ?? ""}:${active.model}` : "";
  useEffect(() => {
    void refresh();
  }, [refresh, modelKey]);

  useEffect(() => {
    const unsubscribe = onEmbeddingIndexProgress(progress => {
      const finished =
        progress.phase === "done" || progress.phase === "failed" || progress.phase === "aborted";
      if (finished) {
        setRunning(null);
        void refresh();
      } else {
        setRunning(progress);
        // 覆盖率随进度推送，进行中不用再拉
        const stats = progress.stats;
        if (stats) setStatus(current => (current ? { ...current, stats } : current));
      }
    });
    return () => unsubscribe();
  }, [refresh]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const result = await startEmbeddingIndex();
      if (result.started) {
        toast.success(embeddingText("ui.indexingStartedForUnindexedAndUpdatedDocuments"));
      } else {
        toast.warning(result.error || embeddingText("ui.couldNotStartIndexing"));
      }
    } catch (error) {
      toast.error(
        embeddingText("message.couldNotStartIndexing", {
          error: embeddingValue(error instanceof Error ? error.message : String(error)),
        })
      );
    } finally {
      setStarting(false);
    }
  };

  const stats = status?.stats;
  const pending = stats ? stats.outdated + stats.unindexed : 0;
  const percent = stats && stats.total > 0 ? Math.round((stats.indexed / stats.total) * 100) : 0;
  const lastRun = status?.lastRun;

  const description = !status
    ? embeddingText("ui.loading")
    : !active
      ? undefined
      : active.provider === "plugin"
        ? embeddingText("ui.pluginModelsRequireManualIndexingAPICharges")
        : embeddingText("ui.localModelsIndexAutomaticallyAtStartupAfter");

  const activeChip = !status
    ? { tone: "ok" as const, text: embeddingText("ui.active") }
    : running
      ? { tone: "accent" as const, text: embeddingText("ui.indexing") }
      : !status.providerReady && active?.provider === "local"
        ? { tone: "warn" as const, text: embeddingText("ui.waitingForDownload") }
        : !status.providerReady && active?.provider === "plugin"
          ? { tone: "warn" as const, text: embeddingText("ui.pluginNotReady") }
          : { tone: "ok" as const, text: embeddingText("ui.active") };

  return (
    <SettingsGroup
      title={embeddingText("ui.currentModel")}
      description={description}
      action={
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            loading={loading}
            onClick={() => void refresh()}
          >
            {embeddingText("ui.refresh")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Play}
            loading={starting}
            disabled={!status?.configValid || running !== null}
            onClick={() => void handleStart()}
          >
            {running ? embeddingText("ui.indexing") : embeddingText("ui.indexNow")}
          </Button>
        </>
      }
    >
      {active ? (
        <SettingRow title={label} description={subtitle}>
          <StatusChip tone={activeChip.tone}>{activeChip.text}</StatusChip>
        </SettingRow>
      ) : (
        <div className={`flex min-h-14 items-center gap-3 px-3 py-2 ${ROW_DIVIDER}`}>
          <span className="text-ink-3 grid size-6 flex-none place-items-center">
            <CircleDashed size={16} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-tau-body-lg text-ink-1 font-medium">
              {embeddingText("ui.noEmbeddingModelEnabled")}
            </div>
            <div className="text-tau-meta text-ink-2 mt-0.5">
              {embeddingText("ui.chooseAModelBelowAndSelectSet")}
            </div>
          </div>
          <StatusChip>{embeddingText("ui.notEnabled")}</StatusChip>
        </div>
      )}

      <SettingRow
        title={embeddingText("ui.indexCoverage")}
        description={
          stats
            ? embeddingText("message.documentsIndexedOutdatedUnindexed", {
                total: embeddingValue(stats.total),
                indexed: embeddingValue(stats.indexed),
                outdated: embeddingValue(stats.outdated),
                unindexed: embeddingValue(stats.unindexed),
              })
            : embeddingText("ui.noStatistics")
        }
      >
        {stats &&
          (pending === 0 ? (
            <StatusChip tone="ok">{embeddingText("ui.upToDate")}</StatusChip>
          ) : (
            <StatusChip tone="warn">
              {embeddingText("index.pending", { count: embeddingValue(pending) })}
            </StatusChip>
          ))}
        <span className="text-tau-meta text-ink-1 w-12 text-right font-semibold tabular-nums">
          {stats ? `${percent}%` : "—"}
        </span>
      </SettingRow>

      {stats && stats.total > 0 && (
        <div className="px-3 pb-3">
          <ProgressBar value={stats.indexed} total={stats.total} />
          <div className="text-tau-sm text-ink-2 mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            {(Object.keys(TYPE_LABELS) as EmbeddingIndexContentType[]).map(type => {
              const counts = stats.byType[type];
              return (
                <span key={type} className="tabular-nums">
                  {TYPE_LABELS[type]} {counts.indexed}/{counts.total}
                  {counts.outdated + counts.unindexed > 0 && (
                    <span className="text-ink-3">
                      {embeddingText("index.typePending", {
                        count: embeddingValue(counts.outdated + counts.unindexed),
                      })}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {running && (
        <SettingRow
          title={embeddingText("ui.indexing2")}
          description={
            running.phase === "collecting"
              ? embeddingText("ui.collectingDocumentsToIndex")
              : embeddingText("message.text", {
                  reason: embeddingValue(REASON_LABELS[running.reason] ?? running.reason),
                  processed: embeddingValue(running.processed),
                  queued: embeddingValue(running.queued),
                  failed: embeddingValue(
                    running.failed > 0
                      ? embeddingText("message.failed", { count: embeddingValue(running.failed) })
                      : ""
                  ),
                })
          }
        >
          <div className="w-[168px]">
            <ProgressBar value={running.processed} total={running.queued} />
          </div>
        </SettingRow>
      )}

      <SettingRow
        title={embeddingText("ui.lastIndexingRun")}
        description={
          lastRun
            ? embeddingText("message.processedSucceeded", {
                date: embeddingValue(formatTime(lastRun.finishedAt, locale)),
                reason: embeddingValue(REASON_LABELS[lastRun.reason] ?? lastRun.reason),
                queued: embeddingValue(lastRun.queued),
                indexed: embeddingValue(lastRun.indexed),
                failed: embeddingValue(
                  lastRun.failed > 0
                    ? embeddingText("message.failed2", { count: embeddingValue(lastRun.failed) })
                    : ""
                ),
                duration: embeddingValue(
                  formatDuration(lastRun, locale, t)
                    ? embeddingText("message.duration", {
                        duration: embeddingValue(formatDuration(lastRun, locale, t)),
                      })
                    : ""
                ),
              })
            : embeddingText("ui.noRecords")
        }
      >
        {lastRun?.phase === "failed" && (
          <StatusChip tone="danger">{embeddingText("ui.failed")}</StatusChip>
        )}
        {lastRun?.phase === "aborted" && (
          <StatusChip tone="neutral">{embeddingText("ui.interrupted")}</StatusChip>
        )}
        {lastRun?.phase === "done" && (
          <StatusChip tone="ok">{embeddingText("ui.completed")}</StatusChip>
        )}
      </SettingRow>
      {lastRun?.phase === "failed" && lastRun.error && (
        <div className="text-tau-sm text-danger px-3 pb-3 break-all">{lastRun.error}</div>
      )}
    </SettingsGroup>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const percent = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div
      className="bg-sunken h-1.5 overflow-hidden rounded-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
    >
      <div
        className="bg-accent h-full rounded-full transition-[width] duration-200"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
