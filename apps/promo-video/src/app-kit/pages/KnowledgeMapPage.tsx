/**
 * 知识地图重建：结构摘自 features/knowledge-map/views/KnowledgeMapView.tsx 与 insights/MapInsightsReport.tsx。
 * 缺省画布用 MapCanvas(app)、洞见侧栏是场景片的文案；主片传 stats / canvasSlot / caption / reportBody 换成 Deep Work 的地图。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { useCurrentFrame } from "remotion";
import { ChevronDown, CircleHelp, FolderKanban, ListChecks, Loader2, Play, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@tau/ui";
import { MapCanvas, type MapCanvasProps } from "../parts/MapCanvas";
import { MAP_NODES } from "../../mock/map";

const CANVAS = { width: 1222 - 300, height: 900 - 46 - 18 - 140 };

/** 画布在 1440×900 窗口里的位置（窗口左上角为原点）；洞见侧栏打开时右边让出 300 */
export const MAP_CANVAS_RECT = { left: 238, top: 159, width: 1186, height: 725 };
export const MAP_REPORT_WIDTH = 300;

export type MapInsightButton = "off" | "reading" | "on";

export function KnowledgeMapPage({
  report = 0,
  canvas,
  stats,
  insightButton,
  insightPressed = false,
  canvasSlot,
  caption,
  reportBody,
}: {
  report?: number;
  canvas?: Omit<MapCanvasProps, "variant" | "width" | "height">;
  stats?: { card: number; article: number; project: number };
  /** 洞见按钮三态（缺省按 report 推断） */
  insightButton?: MapInsightButton;
  insightPressed?: boolean;
  /** 自绘画布（替换缺省的 MapCanvas） */
  canvasSlot?: ReactNode;
  /** 画布左下角说明行（替换缺省文案） */
  caption?: ReactNode;
  /** 洞见侧栏内容（替换缺省文案） */
  reportBody?: ReactNode;
}) {
  const counts = stats ?? { card: MAP_NODES.length - 44, article: 28, project: 16 };
  const button: MapInsightButton = insightButton ?? (report > 0 ? "on" : "off");
  const ButtonIcon = button === "reading" ? Loader2 : Sparkles;
  const insightSpin = useCurrentFrame() * 6;
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1760px] min-w-0 flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mt-5 mb-2 flex h-10 flex-none items-center gap-3 px-8">
          <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em] whitespace-nowrap">知识地图</h1>
          <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
            卡片 {counts.card} · 文章 {counts.article} · 项目文档 {counts.project}
          </span>
          <span
            className={clsx(
              "text-tau-meta inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-full px-2.5",
              button === "on" ? "bg-accent-soft text-accent-text" : insightPressed ? "bg-hover text-ink-1" : "text-ink-2"
            )}
          >
            <ButtonIcon className="size-[13px]" strokeWidth={1.75} style={button === "reading" ? { transform: `rotate(${insightSpin}deg)` } : undefined} />
            {button === "on" ? "退出洞见" : button === "reading" ? "正在读" : "AI 洞见"}
            {button === "off" && <i className="bg-accent size-[5px] rounded-full opacity-75" />}
          </span>
        </div>
        <div className="flex flex-none items-center gap-1.5 px-8 pb-3">
          <Pill active>全部</Pill>
          <Pill count={counts.card}>卡片</Pill>
          <Pill count={counts.article}>文章</Pill>
          <Pill count={counts.project}>项目文档</Pill>
          <span className="rounded-tau-sm text-ink-2 ml-1.5 flex h-7 min-w-0 items-center gap-1.5 px-2 text-[12.5px]">
            <FolderKanban className="size-[13px]" strokeWidth={1.75} />
            全部项目
            <ChevronDown className="size-3" strokeWidth={1.75} />
          </span>
        </div>
        <div className="border-line-2 flex min-h-0 min-w-0 flex-1 overflow-hidden border-t">
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            {canvasSlot ?? (
              <div className="absolute inset-0 grid place-items-center">
                <MapCanvas variant="app" width={report > 0 ? CANVAS.width : CANVAS.width + 300} height={CANVAS.height} {...canvas} />
              </div>
            )}
            {caption ?? (
              <div className="text-tau-meta text-ink-2 absolute bottom-3.5 left-6 flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2.5 tabular-nums">
                <Play className="size-[11px]" fill="currentColor" strokeWidth={1.75} />
                {MAP_NODES.length} 条笔记 · 始于 2021年3月
              </div>
            )}
          </div>
          {report > 0 && reportBody && (
            <aside className="border-line-2 flex flex-none flex-col overflow-hidden border-l" style={{ width: MAP_REPORT_WIDTH * report }}>
              <div className="flex h-full w-[300px] flex-none flex-col px-6 py-5">{reportBody}</div>
            </aside>
          )}
          {report > 0 && !reportBody && (
            <aside
              className="border-line-2 flex w-[300px] flex-none flex-col overflow-hidden border-l px-6 py-5"
              style={{ opacity: Math.min(1, report * 1.5), transform: `translateX(${(1 - report) * 16}px)` }}
            >
              <p className="text-ink-1 text-[14px] leading-[1.8]">这周新写的几条，和你两年前的「卡片笔记法」接上了：两边都在说，记录的工具会反过来塑造想法。</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[
                  ["bg-info", "呼应 2"],
                  ["bg-warn", "问了没写 1"],
                  ["bg-accent", "缺一环 1"],
                ].map(([dot, label]) => (
                  <span key={label} className="bg-surface-hover text-ink-2 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px]">
                    <i className={clsx("size-[7px] rounded-full", dot)} />
                    {label}
                  </span>
                ))}
              </div>
              <div className="border-line-2 mt-2.5 border-t pt-2">
                <div className="text-ink-3 text-[12px]">可以继续想</div>
                {["工具改变思考，还是只是放大了它？", "数字笔记和纸笔，差别在哪里？"].map(q => (
                  <div key={q} className="mt-1.5 flex items-start gap-1.5 text-[13px]">
                    <CircleHelp className="text-ink-3 mt-[3px] size-3.5 shrink-0" strokeWidth={1.75} />
                    {q}
                  </div>
                ))}
              </div>
              <Button variant="secondary" size="sm" icon={ListChecks} block className="mt-3">
                逐条看
              </Button>
              <svg viewBox="0 0 252 92" className="mt-4 w-full">
                {Array.from({ length: 16 }, (_, i) => {
                  const h = [18, 22, 15, 30, 26, 34, 28, 40, 36, 44, 38, 50, 58, 52, 66, 74][i];
                  return <rect key={i} x={i * 15.6 + 2} y={82 - h} width={11} height={h} rx={2} fill={i >= 12 ? "var(--tau-accent)" : "var(--tau-line-1)"} />;
                })}
                <line x1="0" x2="252" y1="82.5" y2="82.5" stroke="var(--tau-line-2)" />
              </svg>
              <div className="text-ink-3 text-[11.5px]">每季度新写的笔记 · 最近一年 248</div>
              <div className="text-ink-3 mt-auto flex items-center justify-between text-[12px] whitespace-nowrap">
                <span>今天 22:05 · 读了 24 组候选</span>
                <span className="flex items-center gap-1">
                  <RefreshCw className="size-3" strokeWidth={1.75} />
                  重新分析
                </span>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ children, count, active }: { children: string; count?: number; active?: boolean }) {
  return (
    <span
      className={clsx(
        "flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] whitespace-nowrap",
        active ? "bg-selected text-accent-text border-transparent font-medium" : "border-line-1 text-ink-2"
      )}
    >
      {children}
      {count !== undefined && <span className={clsx("text-[10.5px] tabular-nums", !active && "text-ink-3")}>{count}</span>}
    </span>
  );
}

/** 画布左下角说明行（components/LinkGraph/GraphCaption.tsx）：平时淡墨；悬停时显出 ▶ 并提亮；播放中显示「月份 · N 条」 */
export function MapCaption({ text, state }: { text: string; state: "idle" | "hover" | "playing" }) {
  return (
    <div
      className={clsx(
        "text-tau-meta absolute bottom-3.5 left-6 flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2.5 tabular-nums",
        state === "hover" ? "text-ink-1 bg-hover/60" : state === "playing" ? "text-ink-2" : "text-ink-3"
      )}
    >
      {state === "hover" && <Play className="size-[11px]" fill="currentColor" strokeWidth={1.75} />}
      {text}
    </div>
  );
}
