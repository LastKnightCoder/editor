/**
 * 嵌入模型 · 当前生效组 —— 首行是当前生效模型（或未启用空态），其后是主内容
 * （卡片 / 文章 / 项目文档 / 日记）向量索引覆盖情况。
 *
 * 索引不是实时的：本地模型在启动、同步后、切换模型时由后台补齐，编辑内容后停止写入
 * 一段时间（IDLE_INDEX_DELAY_MS）再增量补索引；插件模型不自动索引。
 * 这里展示「总数 / 已索引 / 待更新 / 未索引」、进行中的进度与上一轮记录，并支持手动发起
 * 一轮增量索引（只处理未索引与内容有更新的文档）。
 */

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
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  "diary-moment": "日记",
  excerpt: "划线",
  "pdf-annotation": "PDF 标注",
  "web-clip": "剪藏",
  "plugin-entity": "插件内容",
};

const REASON_LABELS: Record<string, string> = {
  manual: "手动发起",
  content_idle: "编辑后自动",
  startup_reconcile: "启动时",
  db_switch: "切换数据库",
  config_switch: "切换配置",
  model_switch: "切换模型",
  sync_upload_reconnect: "同步上传后",
  sync_download_reconnect: "同步下载后",
};

const formatTime = (ts?: number) => {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDuration = (run: EmbeddingIndexProgress) => {
  if (!run.finishedAt) return "";
  const seconds = Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
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
        toast.error(`读取索引状态失败：${error instanceof Error ? error.message : String(error)}`);
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
        // 结束后重新统计覆盖率
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
        toast.success("已开始索引，只处理未索引与内容有更新的文档");
      } else {
        toast.warning(result.error || "无法发起索引");
      }
    } catch (error) {
      toast.error(`发起索引失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setStarting(false);
    }
  };

  const stats = status?.stats;
  const pending = stats ? stats.outdated + stats.unindexed : 0;
  const percent = stats && stats.total > 0 ? Math.round((stats.indexed / stats.total) * 100) : 0;
  const lastRun = status?.lastRun;

  const description = !status
    ? "正在读取…"
    : !active
      ? undefined
      : active.provider === "plugin"
        ? "插件模型不会自动索引，需要手动发起（会产生调用费用）"
        : "本地模型会在启动、同步后、切换模型时自动补齐；编辑内容后停止编辑约 2 分钟自动更新";

  const activeChip = !status
    ? { tone: "ok" as const, text: "生效中" }
    : running
      ? { tone: "accent" as const, text: "索引中" }
      : !status.providerReady && active?.provider === "local"
        ? { tone: "warn" as const, text: "等待下载" }
        : !status.providerReady && active?.provider === "plugin"
          ? { tone: "warn" as const, text: "插件未就绪" }
          : { tone: "ok" as const, text: "生效中" };

  return (
    <SettingsGroup
      title="当前生效"
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
            刷新
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Play}
            loading={starting}
            disabled={!status?.configValid || running !== null}
            onClick={() => void handleStart()}
          >
            {running ? "索引中" : "立即索引"}
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
            <div className="text-tau-body-lg text-ink-1 font-medium">尚未启用嵌入模型</div>
            <div className="text-tau-meta text-ink-2 mt-0.5">
              在下方选择一个模型并点「设为当前」，确认后开始建立索引
            </div>
          </div>
          <StatusChip>未启用</StatusChip>
        </div>
      )}

      <SettingRow
        title="索引覆盖"
        description={
          stats
            ? `共 ${stats.total} 篇 · 已索引 ${stats.indexed} · 待更新 ${stats.outdated} · 未索引 ${stats.unindexed}`
            : "暂无统计"
        }
      >
        {stats &&
          (pending === 0 ? (
            <StatusChip tone="ok">已是最新</StatusChip>
          ) : (
            <StatusChip tone="warn">{pending} 篇待处理</StatusChip>
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
                    <span className="text-ink-3">（待 {counts.outdated + counts.unindexed}）</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {running && (
        <SettingRow
          title="正在索引"
          description={
            running.phase === "collecting"
              ? "正在收集需要索引的文档…"
              : `${REASON_LABELS[running.reason] ?? running.reason} · ${running.processed} / ${running.queued}${running.failed > 0 ? ` · 失败 ${running.failed}` : ""}`
          }
        >
          <div className="w-[168px]">
            <ProgressBar value={running.processed} total={running.queued} />
          </div>
        </SettingRow>
      )}

      <SettingRow
        title="上次索引"
        description={
          lastRun
            ? `${formatTime(lastRun.finishedAt)} · ${REASON_LABELS[lastRun.reason] ?? lastRun.reason} · 处理 ${lastRun.queued} 篇，成功 ${lastRun.indexed}${lastRun.failed > 0 ? `，失败 ${lastRun.failed}` : ""}${formatDuration(lastRun) ? ` · 用时 ${formatDuration(lastRun)}` : ""}`
            : "暂无记录"
        }
      >
        {lastRun?.phase === "failed" && <StatusChip tone="danger">失败</StatusChip>}
        {lastRun?.phase === "aborted" && <StatusChip tone="neutral">已中断</StatusChip>}
        {lastRun?.phase === "done" && <StatusChip tone="ok">完成</StatusChip>}
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
