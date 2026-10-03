/**
 * 洞见视图正文上方的报告卡：位置两三句、各类数量（点击跳到该类第一处）、一张随连接生长的小关系图、
 * 可以继续想的问题；读的过程中只显示一行真实的阶段说明。
 */

import { CircleHelp, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@tau/ui";
import type {
  ContentInsights,
  ContentInsightsPhase,
  InsightAsk,
  InsightKind,
} from "@/types/content-insights";

export const KIND_META: Record<InsightKind, { label: string; dot: string }> = {
  link: { label: "可连接", dot: "bg-info" },
  dup: { label: "重复", dot: "bg-ink-3" },
  conflict: { label: "矛盾", dot: "bg-danger" },
  gap: { label: "可以展开", dot: "bg-ink-3" },
};
const KIND_ORDER: InsightKind[] = ["link", "dup", "conflict", "gap"];

export interface InsightsReportProps {
  insights: ContentInsights | null;
  reading: boolean;
  phase: ContentInsightsPhase | null;
  /** 这篇已经连着的处数（脉络里的关联数） */
  knownLinks: number;
  /** 刚连上的那一处（小图里那条线画出来） */
  freshLink: string | null;
  onJumpKind(kind: InsightKind): void;
  onAsk(ask: InsightAsk): void;
  onReanalyze(): void;
  onWalk(): void;
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function phaseText(phase: ContentInsightsPhase | null) {
  if (phase?.phase === "candidates") {
    return `对照你的 ${phase.notes.toLocaleString("zh-CN")} 份笔记，找到 ${phase.candidates} 处可能相关…`;
  }
  if (phase?.phase === "thinking") return "AI 正在判断哪些值得告诉你…";
  return "正在读…";
}

/** 中间是这篇；实线 = 已连着的，虚线空心 = 还可以连的；最多各画 8 个点 */
function MiniGraph({ known, pending, fresh }: { known: number; pending: number; fresh: boolean }) {
  const solid = Math.min(known, 8);
  const dashed = Math.min(pending, 8);
  const total = Math.max(solid + dashed, 1);
  const point = (i: number, radius: number) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    return { x: 84 + Math.cos(angle) * radius, y: 70 + Math.sin(angle) * radius * 0.88 };
  };
  return (
    <div className="self-center">
      <svg viewBox="0 0 168 150" className="block h-[150px] w-[168px]" aria-hidden>
        {Array.from({ length: dashed }, (_, i) => {
          const p = point(solid + i, 64);
          return (
            <g key={`p${i}`}>
              <line
                x1={84}
                y1={70}
                x2={p.x}
                y2={p.y}
                stroke="var(--tau-info)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.6}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={3.5}
                fill="var(--tau-bg-surface)"
                stroke="var(--tau-info)"
              />
            </g>
          );
        })}
        {Array.from({ length: solid }, (_, i) => {
          const p = point(i, 52);
          const isFresh = fresh && i === solid - 1;
          return (
            <g key={`k${i}`}>
              <line
                x1={84}
                y1={70}
                x2={p.x}
                y2={p.y}
                stroke="var(--tau-ink-3)"
                strokeWidth={1.2}
                strokeDasharray={60}
                className={cn(isFresh && "animate-insight-grow")}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={4}
                fill={isFresh ? "var(--tau-accent)" : "var(--tau-ink-3)"}
              />
            </g>
          );
        })}
        <circle cx={84} cy={70} r={8} fill="var(--tau-accent)" />
      </svg>
      <p className="text-ink-3 mt-0.5 text-center text-[11.5px]">
        已连 {known} 处{pending ? ` · 还可以连 ${pending} 处` : ""}
      </p>
    </div>
  );
}

export function InsightsReport({
  insights,
  reading,
  phase,
  knownLinks,
  freshLink,
  onJumpKind,
  onAsk,
  onReanalyze,
  onWalk,
}: InsightsReportProps) {
  if (reading) {
    return (
      <p className="text-ink-3 text-tau-meta mt-2 flex items-center gap-1.5" role="status">
        <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
        {phaseText(phase)}
      </p>
    );
  }
  if (!insights) return null;
  const { result } = insights;
  const open = result.marks.filter(mark => mark.status === "open");
  const counts = KIND_ORDER.map(kind => ({
    kind,
    n: open.filter(mark => mark.kind === kind).length,
  })).filter(item => item.n > 0);
  const pendingLinks = open.filter(mark => mark.kind === "link" || mark.kind === "dup").length;
  const asks = result.asks.filter(ask => ask.status === "open");
  return (
    <section
      aria-label="AI 洞见"
      className="bg-surface-hover rounded-tau-lg mt-4 grid grid-cols-[1fr_168px] gap-5 px-[18px] pb-3.5 pt-4"
      onMouseDown={event => event.stopPropagation()}
    >
      <div className="min-w-0">
        <p className="text-tau-body-lg text-ink-1 leading-[1.8]">{result.lead}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {counts.length ? (
            counts.map(({ kind, n }) => (
              <button
                key={kind}
                type="button"
                onClick={() => onJumpKind(kind)}
                className="bg-surface text-ink-2 hover:text-ink-1 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-shadow hover:shadow-[0_0_0_1px_var(--tau-line-1)]"
              >
                <i className={cn("size-[7px] rounded-full", KIND_META[kind].dot)} />
                {KIND_META[kind].label} {n}
              </button>
            ))
          ) : (
            <span className="bg-surface text-ink-3 inline-flex h-6 items-center rounded-full px-2.5 text-[12px]">
              都处理完了
            </span>
          )}
        </div>
        {asks.length > 0 && (
          <div className="border-line-2 mt-3 border-t pt-2.5">
            <p className="text-ink-3 mb-1 text-[12px]">可以继续想</p>
            {asks.map(ask => (
              <div
                key={ask.id}
                className="group/ask text-tau-body text-ink-1 flex items-baseline gap-2 py-1"
              >
                <CircleHelp
                  className="text-ink-3 size-[13px] shrink-0 translate-y-[2px]"
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1">{ask.text}</span>
                <button
                  type="button"
                  onClick={() => onAsk(ask)}
                  className="text-ink-3 hover:text-accent-text shrink-0 text-[12px] opacity-0 transition-opacity focus-visible:opacity-100 group-hover/ask:opacity-100"
                >
                  记为问题
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="text-ink-3 mt-2.5 flex flex-wrap items-center gap-3 text-[12px]">
          {insights.stale ? (
            <span className="text-warn">正文在分析后改动较大</span>
          ) : (
            <span>
              {formatTime(insights.analyzedAt)} · 读了 {result.candidates} 份候选，留下{" "}
              {result.marks.length} 处
            </span>
          )}
          <button
            type="button"
            onClick={onReanalyze}
            className="hover:text-ink-1 inline-flex items-center gap-1"
          >
            <RefreshCw className="size-3" strokeWidth={1.75} />
            重新分析
          </button>
          {open.length > 0 && (
            <button
              type="button"
              onClick={onWalk}
              className="text-accent-text ml-auto inline-flex items-center gap-1"
            >
              <ListChecks className="size-3" strokeWidth={1.75} />
              逐条看
            </button>
          )}
        </div>
      </div>
      <MiniGraph known={knownLinks} pending={pendingLinks} fresh={freshLink !== null} />
    </section>
  );
}
