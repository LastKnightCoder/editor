/**
 * 知识地图「AI 洞见」的侧栏与气泡，结构摘自 features/knowledge-map/insights/MapInsightsReport.tsx、MapInsightPopover.tsx。
 */
import clsx from "clsx";
import { ChevronDown, CircleHelp, Link2, ListChecks, Loader2, RefreshCw, X } from "lucide-react";
import { useCurrentFrame } from "remotion";
import { Button, IconButton } from "@tau/ui";

const PILL = "bg-surface-hover text-ink-2 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px]";

export type MapReportContent = {
  reading: string;
  lead: string;
  pills: { dot: string; label: string }[];
  topics: number;
  questions: string[];
  bars: number[];
  recent: number;
  foot: string;
};

/** 侧栏：读取中只有一行；出结果后各块依次显出（appear 0→1） */
export function MapReportBody({ content, reading, appear }: { content: MapReportContent; reading: boolean; appear: number }) {
  const spin = useCurrentFrame() * 6;
  if (reading) {
    return (
      <div className="text-tau-meta text-ink-3 flex items-start gap-1.5 leading-[1.7]">
        <Loader2 className="mt-[3px] size-[13px] shrink-0" strokeWidth={1.75} style={{ transform: `rotate(${spin}deg)` }} />
        {content.reading}
      </div>
    );
  }
  const step = (i: number) => ({ opacity: Math.min(1, Math.max(0, appear * 5 - i)), transform: `translateY(${(1 - Math.min(1, Math.max(0, appear * 5 - i))) * 6}px)` });
  return (
    <div className="flex h-full min-w-0 flex-col">
      <p className="text-ink-1 text-[14px] leading-[1.8]" style={step(0)}>
        {content.lead}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5" style={step(1)}>
        {content.pills.map(p => (
          <span key={p.label} className={PILL}>
            <i className={clsx("size-[7px] rounded-full", p.dot)} />
            {p.label}
          </span>
        ))}
        <span className={PILL}>
          <i className="bg-accent size-[7px] rounded-full" />
          有发现的主题 {content.topics}
          <ChevronDown className="size-3" strokeWidth={1.75} />
        </span>
      </div>
      <div className="border-line-2 mt-2.5 border-t pt-2" style={step(2)}>
        <div className="text-ink-3 mb-0.5 text-[12px]">可以继续想</div>
        {content.questions.map(q => (
          <div key={q} className="text-ink-1 flex items-baseline gap-2 py-[3px] text-[13px]">
            <CircleHelp className="text-ink-3 size-[13px] shrink-0 translate-y-[2px]" strokeWidth={1.75} />
            <span className="min-w-0 flex-1">{q}</span>
          </div>
        ))}
      </div>
      <div style={step(3)}>
        <Button size="sm" variant="secondary" icon={ListChecks} block className="mt-3">
          逐条看
        </Button>
        <div className="border-line-2 mt-4 border-t pt-3">
          <svg viewBox="0 0 252 92" className="block h-auto w-full">
            {content.bars.map((v, i) => {
              const max = Math.max(...content.bars);
              const h = (v / max) * 76;
              const w = 252 / content.bars.length;
              return <rect key={i} x={i * w + 2} y={85 - h} width={w - 4.6} height={h} rx={2} fill={i >= content.bars.length - 4 ? "var(--tau-accent)" : "var(--tau-line-1)"} />;
            })}
            <line x1="0" x2="252" y1="85.5" y2="85.5" stroke="var(--tau-line-2)" />
          </svg>
          <div className="text-ink-3 mt-1 text-[11.5px]">每季度新写的笔记 · 最近一年 {content.recent}</div>
        </div>
      </div>
      <div className="text-ink-3 mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-[12px]" style={step(4)}>
        <span>{content.foot}</span>
        <span className="inline-flex items-center gap-1">
          <RefreshCw className="size-3" strokeWidth={1.75} />
          重新分析
        </span>
      </div>
    </div>
  );
}

export type MapInsightEnd = { place: string; title: string; claim: string };

/** 呼应气泡：AnchoredPanel 360 宽，头部类型 → 摘要句 → 理由 → 两端 → 连接 / 不相关 */
export function MapInsightPopover({ summary, why, ends, pressed }: { summary: string; why: string; ends: [MapInsightEnd, MapInsightEnd]; pressed?: boolean }) {
  return (
    <div className="bg-surface border-line-1 shadow-float rounded-tau-lg w-[360px] max-w-[360px] border">
      <div className="text-tau-body text-ink-1 px-3.5 pt-3 pb-2.5 leading-[1.7]">
        <div className="text-ink-3 -mt-1 -mr-1.5 mb-0.5 flex items-center gap-1.5 text-[11.5px]">
          <i className="bg-info size-[7px] rounded-full" />
          呼应
          <IconButton className="ml-auto size-6">
            <X className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
        <p className="font-medium">{summary}</p>
        <p className="text-ink-2 text-tau-meta mt-0.5">{why}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {ends.map(end => (
            <span key={end.title} className="bg-surface-hover rounded-tau-sm text-tau-meta block min-w-0 px-2.5 py-2 text-left leading-[1.65]">
              <span className="bg-surface text-ink-3 mb-0.5 inline-block max-w-full truncate rounded px-1.5 text-[10.5px]">{end.place}</span>
              <span className="text-ink-1 block truncate font-medium">《{end.title}》</span>
              <span className="text-ink-2 line-clamp-3 block">{end.claim}</span>
            </span>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <span style={{ display: "inline-flex", transform: pressed ? "scale(0.96)" : undefined, filter: pressed ? "brightness(0.92)" : undefined }}>
            <Button size="sm" variant="primary" icon={Link2}>
              连接
            </Button>
          </span>
          <Button size="sm" variant="ghost">
            不相关
          </Button>
        </div>
      </div>
    </div>
  );
}
