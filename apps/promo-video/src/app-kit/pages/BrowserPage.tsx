/**
 * 浏览器 + Tau 插件侧栏重建。侧栏结构与类名摘自 apps/browser-extension（PageHeader / PageStream / SummaryCard /
 * HighlightCard），网页上的划线工具条与高亮摘自 content/ui/FloatingToolbar 与 content/style.css、highlighter.ts。
 * 浏览器外壳（标签栏、地址栏、Chrome 侧栏标题条）是示意，不属于插件界面。
 */
import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Highlighter,
  MessageCircle,
  MoreHorizontal,
  MoreVertical,
  NotebookPen,
  Pin,
  Plus,
  RefreshCw,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import { Img, staticFile } from "remotion";
import { useAppTheme } from "../theme";
import { WEB_PAGE } from "../../mock/deepwork";

/** 划线颜色（content/types.ts，浅底）：默认 pink */
const HIGHLIGHT = { line: "#f472b6", bg: "rgba(244,114,182,.3)" };
const COLOR_DOTS = ["#f472b6", "#a78bfa", "#60a5fa", "#4ade80", "#fb923c"];

export const BROWSER = { width: 1440, height: 900, panel: 380 };

export type BrowserState = {
  /** 选区扫过划线句的进度 0→1（浏览器原生选区底色） */
  select: number;
  /** 工具条出现 0→1 */
  toolbar: number;
  /** 已划线（马克笔底色 + 取色器 + 马克笔激活） */
  marked: boolean;
  /** 侧栏高亮列表里新的一条出现 0→1 */
  listed: number;
};

const Marked = ({ text }: { text: string }) => <mark style={{ backgroundColor: HIGHLIGHT.bg, borderRadius: 2, color: "inherit" }}>{text}</mark>;

/** 网页正文：之前划过的句子带马克笔底色；现场那句先被选区扫过，再划线 */
function Paragraphs({ state }: { state: BrowserState }) {
  return (
    <>
      {WEB_PAGE.paragraphs.map((segments, i) => (
        <p key={i} className="mb-[1.1em]">
          {segments.map(seg => {
            if (seg.mark === "earlier") return <Marked key={seg.text} text={seg.text} />;
            if (seg.mark !== "target") return <span key={seg.text}>{seg.text}</span>;
            const chars = [...seg.text];
            const shown = Math.round(chars.length * state.select);
            return (
              <span key={seg.text} className="relative">
                {state.marked ? (
                  <Marked text={seg.text} />
                ) : (
                  <>
                    <span style={{ background: "rgba(77,127,196,0.22)" }}>{chars.slice(0, shown).join("")}</span>
                    {chars.slice(shown).join("")}
                  </>
                )}
                {state.toolbar > 0 && <FloatingToolbar open={state.toolbar} marked={state.marked} />}
              </span>
            );
          })}
        </p>
      ))}
    </>
  );
}

function ToolButton({ children, active }: { children: ReactNode; active?: boolean }) {
  return <span className={clsx("grid size-8 place-items-center rounded-[6px]", active ? "bg-selected text-accent-text" : "text-ink-2")}>{children}</span>;
}

const ICON = { size: 16, strokeWidth: 2 };

/** 划线工具条：选区上方 10px 居中；划线后马克笔激活，上方 8px 弹出取色器 */
function FloatingToolbar({ open, marked }: { open: number; marked: boolean }) {
  const style: CSSProperties = { left: "50%", bottom: "calc(100% + 10px)", opacity: open, transform: `translateX(-50%) translateY(${(1 - open) * 4}px)` };
  return (
    <span className="font-tau absolute z-10 flex flex-col items-center" style={style}>
      {marked && (
        <span className="border-line-1 bg-surface shadow-float mb-2 flex gap-1.5 rounded-[8px] border px-2.5 py-1.5">
          {COLOR_DOTS.map((c, i) => (
            <span
              key={c}
              className="block size-5 rounded-full border-2"
              style={{ background: c, borderColor: i === 0 ? "var(--tau-ink-1)" : "transparent", transform: i === 0 ? "scale(1.15)" : undefined }}
            />
          ))}
        </span>
      )}
      <span className="border-line-1 bg-surface shadow-float flex items-center gap-0.5 rounded-[8px] border px-1.5 py-1">
        <ToolButton>
          <Copy {...ICON} />
        </ToolButton>
        <span className="bg-line-1 mx-0.5 h-5 w-px" />
        <ToolButton active={marked}>
          <Highlighter {...ICON} />
        </ToolButton>
        <ToolButton>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
          </svg>
        </ToolButton>
        <ToolButton>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M3 12h18" />
          </svg>
        </ToolButton>
        <span className="bg-line-1 mx-0.5 h-5 w-px" />
        <ToolButton>
          <MessageCircle {...ICON} />
        </ToolButton>
        <ToolButton>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </ToolButton>
        <span className="bg-line-1 mx-0.5 h-5 w-px" />
        <ToolButton>
          <MoreVertical {...ICON} />
        </ToolButton>
      </span>
    </span>
  );
}

function SectionHeader({ icon, title, action }: { icon: ReactNode; title: string; action?: string }) {
  return (
    <div className="text-tau-sm text-ink-2 [&>svg]:text-ink-3 flex h-8 items-center gap-1.5 px-1 pt-1.5 font-semibold [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span className="flex-1">{title}</span>
      {action && (
        <span className="text-ink-3 inline-flex items-center gap-0.5 font-normal">
          {action}
          <ChevronRight size={13} strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}

function HighlightRow({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <div className="relative flex gap-2.5 py-2.5 pr-2.5 pl-3" style={style}>
      <span className="w-[3px] shrink-0 rounded-full" style={{ backgroundColor: HIGHLIGHT.line }} />
      <span className="text-ink-1 text-tau-body line-clamp-2 block w-full leading-[1.7]">
        <span style={{ backgroundColor: HIGHLIGHT.bg, borderRadius: 3, padding: "1px 3px" }}>{text}</span>
      </span>
    </div>
  );
}

/** Tau 插件侧栏（宽度由 Chrome 决定，这里取 380） */
function SidePanel({ listed }: { listed: number }) {
  const W = WEB_PAGE;
  const count = W.earlier.length + (listed > 0 ? 1 : 0);
  return (
    <div className="bg-page flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2.5 py-2.5 pr-2.5 pl-3.5">
        <span className="border-line-1 bg-surface text-accent-text grid size-7 shrink-0 place-items-center overflow-hidden rounded-[8px] border text-[12px] font-bold uppercase">少</span>
        <div className="min-w-0 flex-1">
          <div className="text-tau-body-lg text-ink-1 truncate font-semibold">{W.title}</div>
          <div className="text-tau-micro text-ink-3 truncate">{W.host}</div>
        </div>
        <span className="text-ink-2 grid size-8 place-items-center">
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-3 pt-0.5 pb-3">
        <section className="border-line-1 bg-surface rounded-tau-md border px-3.5 pt-2.5 pb-2.5">
          <div className="text-tau-sm text-ink-3 flex h-7 items-center gap-1.5">
            <Sparkles size={14} strokeWidth={1.75} className="text-accent-text shrink-0" />
            <span className="flex-1">AI 总结</span>
            <span className="grid size-7 place-items-center">
              <Copy size={14} strokeWidth={1.75} />
            </span>
            <span className="grid size-7 place-items-center">
              <RefreshCw size={14} strokeWidth={1.75} />
            </span>
          </div>
          <div className="text-tau-body-lg text-ink-1 relative overflow-hidden leading-[1.7]" style={{ maxHeight: 120, maskImage: "linear-gradient(to bottom, black 70%, transparent)" }}>
            <p className="mb-1">{W.summary.lead}</p>
            <ul className="m-0 list-disc ps-5">
              {W.summary.points.map(point => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          <span className="text-tau-sm text-accent-text mt-1 inline-flex items-center gap-0.5">
            展开全部
            <ChevronDown size={13} strokeWidth={1.75} />
          </span>
        </section>
        <SectionHeader icon={<Highlighter />} title={`高亮 ${count}`} action="全部" />
        <div className="border-line-1 bg-surface rounded-tau-md divide-line-2 divide-y overflow-hidden border">
          {listed > 0 && (
            <div style={{ height: 70 * Math.min(1, listed * 1.4), overflow: "hidden" }}>
              <HighlightRow
                text={W.highlight}
                style={{ opacity: listed, transform: `translateY(${(1 - listed) * -8}px)`, background: `color-mix(in srgb, var(--tau-accent-soft) ${(1 - listed) * 100}%, transparent)` }}
              />
            </div>
          )}
          {W.earlier.map(text => (
            <HighlightRow key={text} text={text} />
          ))}
        </div>
        <SectionHeader icon={<NotebookPen />} title="笔记" />
        <div className="border-line-1 text-tau-meta text-ink-2 rounded-tau-md flex h-9 items-center justify-center gap-1.5 border border-dashed">
          <Plus size={14} strokeWidth={1.75} />
          新建笔记
        </div>
      </div>
      <div className="border-line-1 bg-surface relative mx-2.5 mt-1 mb-2.5 flex-none rounded-[16px] border pt-3 pr-2.5 pb-2.5 pl-3.5">
        <div className="text-tau-body-lg text-ink-3 min-h-[22px]">问这一页，Ctrl/Command + Enter 发送</div>
        <div className="mt-2.5 flex items-center gap-1">
          <span className="border-line-1 text-ink-2 grid size-[30px] place-items-center rounded-[10px] border">
            <Plus size={16} strokeWidth={1.75} />
          </span>
          <span className="flex-1" />
          <span className="text-tau-body text-ink-1 flex h-[30px] items-center gap-1 rounded-[9px] pr-1.5 pl-2">
            立答
            <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3" />
          </span>
          <span className="bg-hover text-ink-3 ml-1 grid size-[30px] place-items-center rounded-[10px]">
            <ArrowUp size={16} strokeWidth={2.25} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** 浏览器窗口：左网页、右 Chrome 侧栏（标题条为浏览器自带） */
export function BrowserPage({ state }: { state: BrowserState }) {
  const appTheme = useAppTheme();
  const W = WEB_PAGE;
  return (
    <div
      data-theme={appTheme}
      data-mode="light"
      className="font-tau text-ink-1 relative flex flex-col overflow-hidden bg-[#f1f3f4] antialiased"
      style={{ width: BROWSER.width, height: BROWSER.height, borderRadius: 14, boxShadow: "0 0 0 1px rgba(22,34,49,0.08), 0 2px 6px rgba(22,34,49,0.06), 0 50px 120px -40px rgba(22,34,49,0.45)" }}
    >
      {/* 标签栏 */}
      <div className="flex h-[42px] shrink-0 items-end gap-2 px-3">
        <div className="mb-[14px] flex items-center gap-2 pr-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex h-[34px] w-[240px] items-center gap-2 rounded-t-[10px] bg-white px-3 text-[12.5px] text-[#3c4043]">
          <span className="grid size-4 place-items-center rounded-[4px] bg-[#e8443a] text-[9px] font-bold text-white">少</span>
          <span className="min-w-0 flex-1 truncate">{W.title}</span>
          <X size={13} className="text-[#5f6368]" />
        </div>
      </div>
      {/* 地址栏 */}
      <div className="flex h-[44px] shrink-0 items-center gap-3 bg-white px-3 text-[#5f6368]">
        <ChevronLeft size={18} />
        <ChevronRight size={18} className="opacity-40" />
        <RotateCw size={16} />
        <div className="flex h-[32px] flex-1 items-center rounded-full bg-[#f1f3f4] px-4 text-[13.5px] text-[#202124]">{W.url}</div>
        <Img src={staticFile("tau-logo.png")} className="size-5" />
      </div>
      <div className="flex min-h-0 flex-1 border-t border-[#dadce0]">
        {/* 网页 */}
        <div className="min-w-0 flex-1 overflow-hidden bg-white" style={{ fontFamily: '-apple-system, "PingFang SC", sans-serif' }}>
          <div className="mx-auto w-[640px] pt-[64px] text-[#333]">
            <div className="text-[13px] text-[#999]">{W.meta}</div>
            <h1 className="mt-3 mb-8 text-[32px] leading-[1.35] font-bold text-[#222]">{W.title}</h1>
            <div className="text-[17px] leading-[1.95]">
              <Paragraphs state={state} />
            </div>
          </div>
        </div>
        {/* Chrome 侧栏 */}
        <div className="flex shrink-0 flex-col border-l border-[#dadce0] bg-white" style={{ width: BROWSER.panel }}>
          <div className="flex h-[40px] shrink-0 items-center gap-2 px-3 text-[13px] text-[#3c4043]">
            <Img src={staticFile("tau-logo.png")} className="size-4" />
            <span className="flex-1">Tau</span>
            <Pin size={14} className="text-[#5f6368]" />
            <X size={15} className="text-[#5f6368]" />
          </div>
          <div className="min-h-0 flex-1">
            <SidePanel listed={state.listed} />
          </div>
        </div>
      </div>
    </div>
  );
}
