/**
 * 文章页的 AI 洞见：摘自 features/insights（useInsightsView / InsightsReport / InsightLeaf / InsightPopover / connect.ts）。
 * 点「AI 洞见」后不开侧栏，全在正文里发生：正文上方插入报告卡，句子下画标记（可连接蓝实线、重复灰点线），
 * 点标记弹出锚定气泡，「连接」后那几个字变成内链，报告卡的小关系图长出一条新线。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { CircleHelp, Layers, Link2, ListChecks, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@tau/ui";
import { ArticleHero } from "../parts/ArticleHero";
import { INSIGHTS, type InsightSegment } from "../../mock/deepwork";

export type InsightsState = {
  mode: "off" | "reading" | "on";
  /** 报告卡出现 0→1 */
  report: number;
  /** 各标记画出 0→1（按正文顺序） */
  marks: number[];
  /** 「它更像一种环境」的气泡 0→1 */
  popover: number;
  /** 「连接」按下 */
  pressed: boolean;
  /** 已连接（标记变内链、关系图长出新线）0→1 */
  connected: number;
};

const LINK = "text-accent-text underline decoration-dotted decoration-[1.5px] underline-offset-[3px] decoration-[color:color-mix(in_srgb,var(--tau-accent)_38%,transparent)]";

function Mark({ segment, draw, connected, current }: { segment: InsightSegment; draw: number; connected: number; current: boolean }) {
  const text = segment.bold ? <b className="font-bold">{segment.text}</b> : segment.text;
  if (!segment.mark || draw <= 0) return <>{text}</>;
  if (segment.mark === "link" && connected > 0) return <span className={LINK}>{text}</span>;
  if (segment.mark === "link") {
    return (
      <span
        className={clsx("rounded-[3px]", current && "bg-accent-soft")}
        style={{ backgroundImage: "linear-gradient(var(--tau-info), var(--tau-info))", backgroundSize: `${draw * 100}% 2px`, backgroundPosition: "0 100%", backgroundRepeat: "no-repeat" }}
      >
        {text}
      </span>
    );
  }
  return (
    <span
      className="decoration-ink-3 underline decoration-dotted decoration-2 underline-offset-[5px]"
      style={{ textDecorationColor: `color-mix(in srgb, var(--tau-ink-3) ${draw * 100}%, transparent)` }}
    >
      {text}
    </span>
  );
}

/** 报告卡右栏的小关系图：已连实线（半径 52），还可以连虚线（半径 64），均匀环绕、起点正上方、纵向乘 0.88 */
function MiniGraph({ known, pending, grown }: { known: number; pending: number; grown: number }) {
  const total = known + pending;
  const points = Array.from({ length: total }, (_, i) => {
    const angle = -Math.PI / 2 + (i / total) * Math.PI * 2;
    const linked = i < known;
    const r = linked ? 52 : 64;
    return { x: 84 + Math.cos(angle) * r, y: 70 + Math.sin(angle) * r * 0.88, linked, fresh: linked && i === known - 1 && grown < 1 };
  });
  return (
    <div className="self-center">
      <svg viewBox="0 0 168 150" className="block h-[150px] w-[168px]">
        {points.map((p, i) => (
          <line
            key={`l${i}`}
            x1={84}
            y1={70}
            x2={p.fresh ? 84 + (p.x - 84) * grown : p.x}
            y2={p.fresh ? 70 + (p.y - 70) * grown : p.y}
            stroke={p.linked ? "var(--tau-ink-3)" : "var(--tau-info)"}
            strokeWidth={1.2}
            strokeDasharray={p.linked ? undefined : "3 3"}
            opacity={p.linked ? 1 : 0.6}
          />
        ))}
        {points.map((p, i) =>
          p.linked ? (
            <circle key={`p${i}`} cx={p.x} cy={p.y} r={4} fill={i === known - 1 && grown > 0 ? "var(--tau-accent)" : "var(--tau-ink-3)"} opacity={p.fresh ? grown : 1} />
          ) : (
            <circle key={`p${i}`} cx={p.x} cy={p.y} r={3.5} fill="var(--tau-bg-surface)" stroke="var(--tau-info)" />
          )
        )}
        <circle cx={84} cy={70} r={8} fill="var(--tau-accent)" />
      </svg>
      <p className="text-ink-3 mt-0.5 text-center text-[11.5px]">
        已连 {known} 处{pending > 0 && ` · 还可以连 ${pending} 处`}
      </p>
    </div>
  );
}

function Report({ state, frame }: { state: InsightsState; frame: number }) {
  const I = INSIGHTS;
  if (state.mode === "reading") {
    return (
      <p className="text-ink-3 text-tau-meta mt-2 flex items-center gap-1.5">
        <Loader2 className="size-3.5" style={{ transform: `rotate(${frame * 8}deg)` }} />
        {I.reading}
      </p>
    );
  }
  const linked = state.connected > 0;
  const known = I.known + (linked ? 1 : 0);
  const pending = I.pending - (linked ? 1 : 0);
  return (
    <section
      className="bg-surface-hover rounded-tau-lg mt-4 grid grid-cols-[1fr_168px] gap-5 px-[18px] pt-4 pb-3.5"
      style={{ opacity: state.report, transform: `translateY(${(1 - state.report) * 8}px)` }}
    >
      <div className="min-w-0">
        <p className="text-tau-body-lg text-ink-1 leading-[1.8]">{I.summary}</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {I.chips.map(chip => (
            <span key={chip.label} className="bg-surface text-ink-2 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px]">
              <i className={clsx("size-[7px] rounded-full", chip.dot)} />
              {chip.label} {chip.label === "可连接" && linked ? chip.count - 1 : chip.count}
            </span>
          ))}
        </div>
        <div className="border-line-2 mt-3 border-t pt-2.5">
          <p className="text-ink-3 mb-1 text-[12px]">可以继续想</p>
          <div className="text-tau-body text-ink-1 flex items-baseline gap-2 py-1">
            <CircleHelp className="text-ink-3 size-[13px] shrink-0 translate-y-[2px]" strokeWidth={1.75} />
            <span className="min-w-0 flex-1">{I.ask}</span>
          </div>
        </div>
        <div className="text-ink-3 mt-2.5 flex items-center gap-3 text-[12px] whitespace-nowrap">
          <span className="min-w-0 truncate">{I.foot}</span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <RefreshCw className="size-3" />
            重新分析
          </span>
          <span className="text-accent-text ml-auto inline-flex shrink-0 items-center gap-1">
            <ListChecks className="size-3" />
            逐条看
          </span>
        </div>
      </div>
      <MiniGraph known={known} pending={pending} grown={state.connected} />
    </section>
  );
}

/** 锚定在标记下方的气泡（bottom-start，无箭头，宽 360） */
function Popover({ open, pressed }: { open: number; pressed: boolean }) {
  const P = INSIGHTS.popover;
  return (
    <span
      className="bg-surface border-line-1 shadow-float rounded-tau-lg font-tau absolute top-[calc(100%+6px)] left-0 z-20 block w-[360px] border"
      style={{ opacity: open, transform: `translateY(${(1 - open) * 6}px)` }}
    >
      <span className="text-tau-body text-ink-1 relative block px-3.5 pt-3 pb-2.5 leading-[1.7]">
        <span className="text-ink-2 absolute top-1.5 right-1.5 grid size-6 place-items-center">
          <X className="size-3.5" />
        </span>
        <span className="block pr-5">{P.why}</span>
        <span className="bg-surface-hover rounded-tau-sm mt-2 block w-full px-2.5 py-2 text-left">
          <span className="text-ink-1 text-tau-meta flex items-center gap-1.5 font-medium">
            <Layers className="text-ink-3 size-[13px]" strokeWidth={1.75} />
            {P.title}
          </span>
          <span className="text-ink-2 text-tau-meta mt-0.5 line-clamp-3 block leading-[1.65]">{P.excerpt}</span>
        </span>
        <span className="mt-2.5 flex items-center gap-1.5">
          <Button size="sm" variant="primary" icon={Link2} style={pressed ? { filter: "brightness(0.9)" } : undefined}>
            连接
          </Button>
          <Button size="sm" variant="ghost">
            不相关
          </Button>
        </span>
      </span>
    </span>
  );
}

export function InsightsArticlePage({ title, words, links, state, frame }: { title: string; words: number; links: number; state: InsightsState; frame: number }) {
  let markIndex = 0;
  const segments = (list: InsightSegment[]): ReactNode =>
    list.map((seg, i) => {
      const k = seg.mark ? markIndex++ : -1;
      const draw = k >= 0 ? (state.marks[k] ?? 0) : 1;
      const isLinkMark = seg.mark === "link";
      return (
        <span key={i} className={isLinkMark ? "relative" : undefined} data-hit={isLinkMark ? "link-mark" : undefined}>
          <Mark segment={seg} draw={draw} connected={state.connected} current={isLinkMark && state.popover > 0 && state.connected <= 0} />
          {isLinkMark && state.popover > 0 && state.connected <= 0 && <Popover open={state.popover} pressed={state.pressed} />}
        </span>
      );
    });
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <ArticleHero title={title} titleCount={[...title].length} words={words} links={links} insights={state.mode} frame={frame} />
          <div className="grid grid-cols-[1fr_minmax(0,720px)_1fr] items-start px-[26px] pt-8 pb-10">
            <article className="col-start-2 min-w-0">
              {state.mode !== "off" && <div className="mb-6">{<Report state={state} frame={frame} />}</div>}
              <div className="relative text-[16px] leading-[1.65]">
                {state.mode === "reading" && (
                  <div
                    className="rounded-tau-md absolute -inset-x-6 h-24 bg-[linear-gradient(180deg,transparent,var(--tau-accent-soft)_45%,var(--tau-accent-soft)_55%,transparent)]"
                    style={{ top: `${((frame % 108) / 108) * 120 - 20}%` }}
                  />
                )}
                {INSIGHTS.blocks.map((block, i) => {
                  if (block.kind === "h2")
                    return (
                      <h2 key={i} className="relative mt-[1.3em] mb-[0.6em] w-fit text-[1.75em] leading-[1.5] font-bold first:mt-0">
                        {block.text}
                      </h2>
                    );
                  if (block.kind === "p")
                    return (
                      <p key={i} className="relative mb-[1.25em]">
                        {segments(block.segments)}
                      </p>
                    );
                  return (
                    <ul key={i} className="m-0 mb-[1.25em] ps-[2.5em]">
                      {block.items.map((item, j) => (
                        <li
                          key={j}
                          className="relative mb-[0.5em] list-none pl-[0.5em] before:absolute before:top-[0.7em] before:-left-[1em] before:h-[0.35em] before:w-[0.35em] before:rounded-full before:bg-[var(--tau-accent)]"
                        >
                          {segments(item)}
                        </li>
                      ))}
                    </ul>
                  );
                })}
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
