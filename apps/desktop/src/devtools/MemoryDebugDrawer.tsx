import { useEffect, useMemo, useState } from "react";
import { Activity, BrainCircuit, CircleAlert, Clock3 } from "lucide-react";
import { Drawer, Segmented, cn } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import { useMemoryDebug, type MemoryDebugSelection } from "./memory-debug-queries";
import type { AssistantMemory } from "@/types/assistant-memory";
import type {
  MemoryDebugDetail,
  MemoryDebugEpisode,
  MemoryDebugModel,
  MemoryDebugSnapshot,
} from "@/types/assistant-memory-debug";

type View = "overview" | "state" | "profile" | "episodes" | "events";
type Selection = MemoryDebugSelection;
const phaseLabel = {
  idle: "等待后台工作",
  scanning: "分页对账来源",
  reading: "读取来源",
  extracting: "提炼个人经历",
  reconciling: "对账已有经历",
  reflecting: "归纳个人理解",
  reviewing: "全面复核",
} as const;
const kindLabel: Record<AssistantMemory["kind"], string> = {
  event: "经历",
  fact: "个人事实",
  preference: "偏好",
  routine: "习惯",
  intention: "目标",
  interest: "兴趣",
};
const formatTime = (value: number | null) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "未安排";
const elapsed = (started: number | null, now: number) =>
  started ? `${Math.max(0, Math.floor((now - started) / 1000))} 秒` : "";

export function MemoryDebugDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [view, setView] = useState<View>("overview");
  const [selection, setSelection] = useState<Selection>(null);
  const [now, setNow] = useState(Date.now);
  const [width, setWidth] = useState(600);
  const { database, connected, snapshot, detail, live, streamError } = useMemoryDebug(
    open,
    selection
  );
  useOverlayDismiss(() => onOpenChange(false), open);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const list = useMemo<Array<MemoryDebugModel | MemoryDebugEpisode>>(() => {
    const data = snapshot.data?.data;
    if (!data) return [];
    if (view === "state") return data.recent;
    if (view === "profile") return data.profile;
    if (view === "episodes") return data.episodes;
    if (view === "overview") return [...data.recent, ...data.profile].slice(0, 12);
    return [];
  }, [snapshot.data, view]);

  const blocking = snapshot.data?.blockingReason;
  const status = !connected
    ? "等待资料库连接"
    : blocking === "unconfigured"
      ? "未分配个人记忆模型"
      : blocking === "foreground"
        ? "前台助手处理中，后台暂停"
        : blocking === "sync"
          ? "资料库同步中，后台暂停"
          : snapshot.data?.worker.running
            ? phaseLabel[snapshot.data.worker.phase]
            : snapshot.data?.vectors.running
              ? "正在生成本地向量"
              : snapshot.data?.worker.scanning
                ? "正在补齐来源"
                : snapshot.data?.configured
                  ? phaseLabel.idle
                  : "正在连接记忆模块";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
      fill
      size="lg"
      width={width}
      minWidth={360}
      maxWidth={900}
      onWidthChange={setWidth}
      label="个人助手记忆实时调试"
      title="个人记忆调试"
      icon={<BrainCircuit className="size-4" />}
      subtitle={database}
      meta={
        <>
          <span
            className={cn(
              "size-2 rounded-full",
              blocking ? "bg-warn" : snapshot.data?.worker.running ? "bg-accent" : "bg-ok"
            )}
          />
          <span aria-live="polite">{status}</span>
          <span className="text-ink-3 ml-auto">{live ? "实时推送已连接" : "正在连接推送"}</span>
        </>
      }
      className="fixed top-3 right-3 bottom-3 z-[900]"
      bodyClassName="min-h-0 p-0"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {snapshot.data && (
          <div className="text-ink-2 text-tau-meta flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2">
            <span>{snapshot.data.data.counts.episodes} 条经历</span>
            <span>{snapshot.data.data.counts.profile} 条画像</span>
            <span>{snapshot.data.data.counts.state} 条近期状态</span>
            <span>
              {snapshot.data.worker.running
                ? elapsed(snapshot.data.worker.startedAt, now)
                : "后台空闲"}
            </span>
          </div>
        )}
        <div className="shrink-0 overflow-x-auto px-4 pb-3">
          <Segmented
            label="记忆调试视图"
            value={view}
            onValueChange={value => {
              setView(value as View);
              setSelection(null);
            }}
          >
            <Segmented.Item value="overview" label="概览" />
            <Segmented.Item value="state" label="近期状态" />
            <Segmented.Item value="profile" label="长期画像" />
            <Segmented.Item value="episodes" label="经历" />
            <Segmented.Item value="events" label="过程" />
          </Segmented>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {view === "overview" && snapshot.data && <Overview snapshot={snapshot.data} now={now} />}
          {view === "overview" && snapshot.data && snapshot.data.data.portrait.length > 0 && (
            <section className="mb-3 flex flex-col gap-1">
              <h3 className="text-ink-2 text-tau-caption px-2.5 font-medium">用户总述</h3>
              {snapshot.data.data.portrait.map((line, index) => (
                <p
                  key={index}
                  className={cn(
                    "text-tau-meta px-2.5",
                    line.stale ? "text-ink-3 line-through" : "text-ink-2"
                  )}
                >
                  {line.text}
                  <span className="text-ink-3 text-tau-caption ml-2">
                    依据 {line.modelIds.join("、")}
                    {line.stale ? " · 依据已变化" : ""}
                  </span>
                </p>
              ))}
            </section>
          )}
          {(view === "state" ||
            view === "profile" ||
            view === "episodes" ||
            view === "overview") && (
            <div className="flex flex-col gap-1">
              {view === "overview" && (
                <h3 className="text-ink-2 text-tau-caption px-2.5 font-medium">最新沉淀</h3>
              )}
              {list.map(item => {
                const layer = "layer" in item ? item.layer : "episode";
                const expanded = selection?.id === item.id && selection.layer === layer;
                return (
                  <div key={`${layer}:${item.id}`} className="rounded-tau-sm hover:bg-hover/60">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setSelection(expanded ? null : { id: item.id, layer })}
                      className="w-full min-w-0 px-2.5 py-2 text-left"
                    >
                      <div className="text-ink-1 text-tau-sm flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 font-medium">{item.topic}</span>
                        <span className="text-ink-3 shrink-0">
                          {"layer" in item
                            ? item.confidence === "explicit"
                              ? "明确自述"
                              : "系统归纳"
                            : item.state === "history"
                              ? "历史"
                              : item.state === "observation"
                                ? "观察"
                                : "当前"}
                        </span>
                      </div>
                      <p className="text-ink-2 text-tau-meta mt-0.5">{item.text}</p>
                      <div className="text-ink-3 text-tau-caption mt-1 flex items-center gap-3">
                        <span>{kindLabel[item.kind]}</span>
                        <span>观测于 {formatTime(item.observedAt)}</span>
                        <span>
                          {"layer" in item
                            ? `${item.episodeIds.length} 条依据`
                            : `${item.evidenceCount} 条依据 · ${item.sourceKinds.join("、")}`}
                        </span>
                      </div>
                      <p className="text-ink-3 text-tau-caption mt-0.5">
                        沉淀于 {formatTime(item.updatedAt)}
                        {item.expiresAt !== null && item.expiresAt <= now
                          ? " · 已过期，等待后台整理"
                          : ""}
                      </p>
                    </button>
                    {expanded && (
                      <Detail
                        detail={detail.data}
                        loading={detail.isPending}
                        error={detail.error}
                      />
                    )}
                  </div>
                );
              })}
              {snapshot.data && view !== "overview" && list.length === snapshot.data.data.limit && (
                <p className="text-ink-3 text-tau-caption px-2.5 py-2">
                  显示最近更新的 {snapshot.data.data.limit} 项
                </p>
              )}
              {snapshot.data && list.length === 0 && (
                <p className="text-ink-3 text-tau-meta px-2.5 py-5">
                  {view === "overview"
                    ? "尚未形成画像或近期状态，可在“经历”中查看已提炼的个人表达。"
                    : "当前没有已沉淀的条目"}
                </p>
              )}
            </div>
          )}
          {view === "events" && <Events events={snapshot.data?.events ?? []} />}
          {snapshot.isPending && (
            <p className="text-ink-3 text-tau-meta py-6">正在读取当前资料库...</p>
          )}
          {(snapshot.error || streamError) && (
            <p role="alert" className="text-danger text-tau-meta py-3">
              {streamError ??
                (snapshot.error instanceof Error ? snapshot.error.message : "记忆诊断读取失败")}
            </p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Overview({ snapshot, now }: { snapshot: MemoryDebugSnapshot; now: number }) {
  const { worker, vectors, data } = snapshot;
  const progress = data.progress;
  return (
    <div className="text-tau-meta space-y-4 pb-4">
      <section>
        <h3 className="text-ink-2 text-tau-caption mb-1.5 font-medium">当前处理</h3>
        <div className="text-ink-1 flex items-center gap-2">
          <Activity className="text-accent size-4" aria-hidden />
          <span>{statusOf(snapshot)}</span>
          {worker.running && (
            <span className="text-ink-3 ml-auto">{elapsed(worker.startedAt, now)}</span>
          )}
        </div>
        {worker.sources.map(source => (
          <p key={`${source.kind}:${source.id}`} className="text-ink-3 truncate pt-1 pl-6">
            {source.title ?? source.id} · {source.kind}
          </p>
        ))}
        <div className="text-ink-3 mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <span>来源：{progress.checked} 已核对</span>
          <span>{progress.pending} 待处理</span>
          <span>{progress.failed} 失败待重试</span>
        </div>
        <div className="text-ink-3 mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <span>下次归纳：{formatTime(worker.nextReflectionAt)}</span>
          <span>全面复核：{formatTime(worker.nextReviewAt)}</span>
          {worker.lastReviewAt && <span>上次复核：{formatTime(worker.lastReviewAt)}</span>}
        </div>
        {!!worker.reviewCursor && (
          <p className="text-ink-3 mt-1">全面复核断点：经历 #{worker.reviewCursor}</p>
        )}
      </section>
      <section>
        <h3 className="text-ink-2 text-tau-caption mb-1.5 font-medium">本地向量索引</h3>
        <p className="text-ink-2">
          {vectors.configured
            ? `${vectors.model} · ${vectors.ready ? "模型就绪" : "模型未就绪"}`
            : "未配置，不影响关键词检索"}
        </p>
        {vectors.configured && (
          <p className="text-ink-3 mt-1">
            {data.counts.indexed} 已索引 · {data.counts.pendingVectors} 待索引
            {vectors.retryAt ? ` · 重试 ${formatTime(vectors.retryAt)}` : ""}
          </p>
        )}
        {vectors.running && (
          <p className="text-ink-2 mt-1">正在生成本地向量 · {elapsed(vectors.startedAt, now)}</p>
        )}
        {vectors.failures > 0 && (
          <p className="text-warn mt-1">
            嵌入已失败 {vectors.failures} 次，
            {vectors.retryAt ? "等待自动重试" : "等待下次来源变化重试"}
          </p>
        )}
      </section>
      {!!data.counts.excluded && (
        <p className="text-ink-3 text-tau-caption">
          另有 {data.counts.excluded} 条记录不参与个人记忆召回。
        </p>
      )}
      <p className="text-ink-3 text-tau-caption">
        最近推送 {formatTime(snapshot.capturedAt)} · 只读查看，展开条目核对出处
      </p>
    </div>
  );
}

function statusOf(snapshot: MemoryDebugSnapshot) {
  if (snapshot.blockingReason === "unconfigured") return "未分配记忆模型，来源保留并等待配置";
  if (snapshot.blockingReason === "foreground") return "前台助手占用模型，后台处理已暂停";
  if (snapshot.blockingReason === "sync") return "资料库同步中，后台处理已暂停";
  if (snapshot.worker.running) return phaseLabel[snapshot.worker.phase];
  if (snapshot.vectors.running) return "正在生成本地向量";
  if (snapshot.worker.scanning) return "正在分页补齐历史来源";
  return snapshot.configured ? phaseLabel.idle : "正在连接记忆模块";
}

function Detail({
  detail,
  loading,
  error,
}: {
  detail?: MemoryDebugDetail;
  loading: boolean;
  error: Error | null;
}) {
  if (loading) return <p className="text-ink-3 px-3 pb-3">正在核对经历与原文...</p>;
  if (error)
    return (
      <p role="alert" className="text-danger px-3 pb-3">
        {error.message}
      </p>
    );
  if (!detail) return null;
  return (
    <div className="space-y-2 px-3 pb-3">
      {detail.model && (
        <p className="text-ink-2">
          {detail.model.layer === "profile" ? "长期画像" : "近期状态"} · {detail.model.confidence} ·{" "}
          {formatTime(detail.model.observedAt)}
        </p>
      )}
      {!detail.episodes.length && (
        <p className="text-ink-3">支持经历已移除或不参与个人记忆，等待后台重新核对。</p>
      )}
      {detail.episodes.map(episode => (
        <div key={episode.id} className="bg-page rounded-tau-sm px-3 py-2">
          <p className="text-ink-1 text-tau-meta">{episode.text}</p>
          {episode.evidence.map((evidence, index) => (
            <p
              key={`${evidence.kind}:${evidence.id}:${evidence.anchor}:${index}`}
              className={cn(
                "text-tau-caption mt-1",
                evidence.available ? "text-ink-3" : "text-warn"
              )}
            >
              {evidence.available ? "证据" : "原文暂不可核对"} ·{" "}
              {evidence.title ?? `${evidence.kind} ${evidence.id}`} · {evidence.quote}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function Events({ events }: { events: MemoryDebugSnapshot["events"] }) {
  if (!events.length) return <p className="text-ink-3 text-tau-meta py-5">等待后台产生处理事件</p>;
  return (
    <div className="space-y-1">
      {events.map((event, index) => (
        <div
          key={`${event.at}:${event.area}:${index}`}
          className="text-tau-caption flex items-start gap-2 px-2 py-1.5"
        >
          {event.level === "error" ? (
            <CircleAlert className="text-danger mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : (
            <Clock3 className="text-ink-3 mt-0.5 size-3.5 shrink-0" aria-hidden />
          )}
          <span className="text-ink-2 min-w-0 flex-1">
            {event.message}
            {event.source && (
              <span className="text-ink-3 block truncate">
                {event.source.title ?? event.source.id} · {event.source.kind}
              </span>
            )}
          </span>
          <time className="text-ink-3 shrink-0">{formatTime(event.at)}</time>
        </div>
      ))}
    </div>
  );
}
