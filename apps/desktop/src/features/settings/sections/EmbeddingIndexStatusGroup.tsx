/**
 * 嵌入模型 · 索引状态 —— 主内容（卡片 / 文章 / 项目文档 / 日记）向量索引覆盖情况。
 *
 * 索引不是实时的：本地模型在启动、同步后、切换模型时由后台补齐，编辑内容后停止写入
 * 一段时间（IDLE_INDEX_DELAY_MS）再增量补索引；API 模型不自动索引。
 * 这里展示「总数 / 已索引 / 待更新 / 未索引」、进行中的进度与上一轮记录，并支持手动发起
 * 一轮增量索引（只处理未索引与内容有更新的文档）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { Button, toast } from "@tau/ui";
import {
  getEmbeddingIndexStatus,
  onEmbeddingIndexProgress,
  startEmbeddingIndex,
  type EmbeddingIndexContentType,
  type EmbeddingIndexProgress,
  type EmbeddingIndexStatus,
} from "@/commands";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";

const TYPE_LABELS: Record<EmbeddingIndexContentType, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  "diary-daily": "日记",
  excerpt: "划线",
  "pdf-annotation": "PDF 标注",
  "web-clip": "剪藏",
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

export function EmbeddingIndexStatusGroup({ modelKey }: { modelKey: string }) {
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

  // 模型 / 来源切换后重新统计（切换会触发后台重建）
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
    : !status.configValid
      ? "尚未启用可用的嵌入模型"
      : status.autoIndex
        ? "本地模型会在启动、同步后、切换模型时自动补齐；编辑内容后停止编辑约 2 分钟自动更新"
        : "API 模型不会自动索引，需要手动发起（会产生调用费用）";

  return (
    <SettingsGroup
      title="索引状态"
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
        <div className="text-tau-sm text-danger break-all px-3 pb-3">{lastRun.error}</div>
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
