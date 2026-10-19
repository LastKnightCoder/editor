/**
 * 白板详情重建：纸面摘自 features/whiteboards/views/WhiteboardDetailView.tsx，顶部工具栏 / 右下状态栏 / 左下页签条
 * 摘自 packages/whiteboard 的 Toolbar、StatusBar、SheetBar 与 chrome（ChromeBar / ChromeButton）。
 * 演示模式由外部用 PresentationScreen 画在全屏上（真实软件对白板容器 requestFullscreen）。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import {
  ArrowUpRight,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Crosshair,
  FileText,
  Frame,
  Globe,
  Image,
  Maximize,
  Minus,
  MousePointer2,
  Network,
  PenLine,
  Play,
  Plus,
  Presentation,
  Shapes,
  Type,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { mix } from "../../brand/motion";
import { useAppTheme } from "../theme";

export type BoardTool = "select" | "shape" | "arrow" | "pen" | "text" | "mind";

const TOOL_GROUPS: { key: string; icon: LucideIcon }[][] = [
  [{ key: "select", icon: MousePointer2 }],
  [
    { key: "shape", icon: Shapes },
    { key: "arrow", icon: ArrowUpRight },
    { key: "pen", icon: PenLine },
    { key: "text", icon: Type },
    { key: "mind", icon: Network },
  ],
  [
    { key: "image", icon: Image },
    { key: "video", icon: Video },
    { key: "audio", icon: AudioLines },
    { key: "web", icon: Globe },
  ],
  [
    { key: "doc", icon: FileText },
    { key: "board", icon: Presentation },
  ],
  [
    { key: "frame", icon: Frame },
    { key: "column", icon: Columns3 },
  ],
];

const CHROME_BAR = "bg-surface shadow-lift ring-line-2 absolute z-[6] flex items-center gap-0.5 rounded-[12px] p-1 ring-1";
const CHROME_BUTTON = "text-ink-2 relative inline-grid size-[30px] flex-none place-items-center rounded-[8px] [&_svg]:size-4 [&_svg]:shrink-0";
const GHOST = "text-tau-meta text-ink-2 inline-flex h-[30px] items-center gap-[6px] whitespace-nowrap rounded-[8px] px-2.5 font-[550]";

/** 工具栏按钮的左缘（ChromeBar p-1 + 按钮 30 + 间距 2，组间 ChromeGap 8 + 两侧间距） */
function toolLeft(key: string) {
  let left = 4;
  for (let g = 0; g < TOOL_GROUPS.length; g++) {
    if (g > 0) left += 8 + 2;
    for (const tool of TOOL_GROUPS[g]) {
      if (tool.key === key) return left;
      left += 30 + 2;
    }
  }
  return 4;
}

/**
 * tool 为当前工具；toolFrom / toolMix 让高亮底块在两个工具间滑动（同软件 180ms 过渡）。
 * sketchPressed / presentPressed 是状态栏按钮被按下的高亮。
 */
export function WhiteboardPage({
  canvas,
  tool,
  toolFrom,
  toolMix = 1,
  sketch,
  sketchPressed = 0,
  presentPressed = 0,
  zoomText = "100%",
  chrome = 1,
}: {
  canvas: ReactNode;
  tool: BoardTool;
  toolFrom?: BoardTool;
  toolMix?: number;
  sketch: boolean;
  sketchPressed?: number;
  presentPressed?: number;
  zoomText?: string;
  chrome?: number;
}) {
  const slider = mix(toolLeft(toolFrom ?? tool), toolLeft(tool), toolMix);
  return (
    <div className="relative flex h-full min-h-0 flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg relative min-h-0 flex-1 overflow-hidden">
        {canvas}
        <div style={{ opacity: chrome }}>
          <div className={clsx(CHROME_BAR, "top-3 left-1/2 -translate-x-1/2")}>
            <span className="bg-accent-soft pointer-events-none absolute top-1 h-[30px] w-[30px] rounded-[8px]" style={{ left: slider }} />
            {TOOL_GROUPS.map((group, g) => (
              <span key={g} className="contents">
                {g > 0 && <span className="size-2 flex-none" />}
                {group.map(t => (
                  <span key={t.key} className={clsx(CHROME_BUTTON, t.key === tool && toolMix > 0.5 && "text-accent-text")}>
                    <t.icon strokeWidth={1.75} />
                  </span>
                ))}
              </span>
            ))}
          </div>

          <div className={clsx(CHROME_BAR, "bottom-3 left-3")}>
            <span className="text-ink-2 inline-flex h-[30px] items-center gap-1.5 rounded-[8px] pr-2.5 pl-2 text-[12.5px]">
              <Plus className="size-4" strokeWidth={1.75} />
              新建页
            </span>
          </div>

          <div className={clsx(CHROME_BAR, "right-3 bottom-3 text-[12px]")}>
            <span className={GHOST} style={sketchPressed > 0 ? { background: `color-mix(in srgb, var(--tau-bg-press) ${sketchPressed * 100}%, transparent)` } : undefined}>
              <PenLine className="size-4" strokeWidth={1.75} />
              {sketch ? "手绘 · 自然" : "普通"}
            </span>
            <span className="w-1 flex-none" />
            <span className={CHROME_BUTTON}>
              <Minus strokeWidth={1.75} />
            </span>
            <span className="text-ink-2 grid h-[30px] min-w-12 place-items-center rounded-[8px] text-center tabular-nums">{zoomText}</span>
            <span className={CHROME_BUTTON}>
              <Plus strokeWidth={1.75} />
            </span>
            <span className={CHROME_BUTTON}>
              <Maximize strokeWidth={1.75} />
            </span>
            <span className="w-1 flex-none" />
            <span className={GHOST} style={presentPressed > 0 ? { background: `color-mix(in srgb, var(--tau-bg-press) ${presentPressed * 100}%, transparent)` } : undefined}>
              <Play className="size-4" strokeWidth={1.75} />
              演示
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 演示模式：白板容器全屏，底部导航条 + 进入时的操作提示 */
export function PresentationScreen({ canvas, index, total, hint }: { canvas: ReactNode; index: number; total: number; hint: number }) {
  const appTheme = useAppTheme();
  return (
    <div data-theme={appTheme} data-mode="light" className="bg-surface font-tau text-ink-1 absolute inset-0 overflow-hidden">
      {canvas}
      <div className="pointer-events-none absolute inset-0 z-[1000] overflow-hidden">
        <div className={clsx(CHROME_BAR, "bottom-[22px] left-1/2 z-[1001] -translate-x-1/2 gap-0.5 text-[12.5px] select-none")}>
          <span className={CHROME_BUTTON}>
            <ChevronLeft strokeWidth={1.75} />
          </span>
          <span className="text-ink-2 min-w-[56px] text-center tabular-nums">
            <b className="text-ink-1 font-semibold">{index}</b> / {total}
          </span>
          <span className={CHROME_BUTTON}>
            <ChevronRight strokeWidth={1.75} />
          </span>
          <span className="size-2 flex-none" />
          <span className={CHROME_BUTTON}>
            <Crosshair strokeWidth={1.75} />
          </span>
          <span className="text-tau-meta text-ink-2 inline-flex h-[28px] items-center gap-[6px] rounded-[10px] px-[13px] font-[550]">
            <X className="size-4" strokeWidth={1.75} />
            退出
          </span>
        </div>
        {hint > 0 && (
          <div
            className="bg-ink-1 text-ink-inverse shadow-float absolute top-[22px] left-1/2 z-[1001] -translate-x-1/2 rounded-[10px] px-3.5 py-[7px] text-[12.5px] whitespace-nowrap"
            style={{ opacity: hint }}
          >
            使用方向键或滚轮导航，按 ESC 退出演示模式
          </div>
        )}
      </div>
    </div>
  );
}
