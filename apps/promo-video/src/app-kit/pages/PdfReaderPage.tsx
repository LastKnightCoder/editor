/**
 * PDF 阅读重建：结构摘自 features/pdfs（PdfDetailView / ReaderLayout / LeftPanel / FloatToolbar / Hud）。
 * 动画参数全部外置：highlight 划线扫过进度、toolbar 工具条出现、annotation 新标注入列、convertHover 「转为卡片」显形。
 */
import clsx from "clsx";
import { ChevronDown, ChevronUp, Copy, Hand, Highlighter, Layers, MessageCircle, MessageSquarePlus, Minus, MoreHorizontal, PanelLeft, Plus, Search, Sparkles, CircleHelp } from "lucide-react";
import { SegmentedLook } from "../parts/Segmented";
import { PDF_PAGE } from "../../mock/day";

const PDF_YELLOW = "#fde58b";

export function PdfReaderPage({ highlight = 0, toolbar = 0, annotation = 0, convertHover = 0 }: { highlight?: number; toolbar?: number; annotation?: number; convertHover?: number }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 overflow-hidden">
        <div className="bg-surface flex min-h-0 min-w-0 flex-1">
          <aside className="flex min-h-0 w-[260px] shrink-0 flex-col overflow-hidden">
            <div className="flex min-h-0 w-[260px] flex-1 flex-col gap-2.5 py-3.5 pr-1.5 pl-3.5">
              <SegmentedLook items={["目录", "页面", "标注", "书签"]} active={2} />
              <div className="mr-2 flex items-center gap-1.5">
                <span className="bg-selected text-accent-text flex h-6 items-center gap-1.5 rounded-full border border-transparent px-3 text-[12px] font-medium">
                  全部 <span className="text-[10.5px] tabular-nums opacity-75">{PDF_PAGE.annotations.length + (annotation > 0.5 ? 1 : 0)}</span>
                </span>
                <span className="border-line-1 text-ink-2 flex h-6 items-center rounded-full border px-3 text-[12px]">有笔记</span>
                <span className="ml-auto flex gap-1">
                  {["bg-tag-4", "bg-tag-5", "bg-tag-1", "bg-tag-2", "bg-tag-3"].map(c => (
                    <i key={c} className={clsx("size-3 shrink-0 rounded-full", c)} />
                  ))}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {annotation > 0 && (
                  <div
                    className="relative"
                    style={{
                      opacity: annotation,
                      transform: `translateY(${(1 - annotation) * -12}px)`,
                      maxHeight: 160 * annotation,
                    }}
                  >
                    <div className="rounded-tau-sm bg-selected flex w-full flex-col gap-1 px-2 py-2 text-left">
                      <span className="text-tau-sm text-ink-1 border-tag-4 line-clamp-3 border-l-[3px] pl-2 leading-relaxed">{PDF_PAGE.highlight}</span>
                      <span className="text-tau-meta text-ink-3 pl-0.5 tabular-nums">第 {PDF_PAGE.page} 页</span>
                    </div>
                    <div className="absolute right-1.5 bottom-1.5 flex gap-1" style={{ opacity: convertHover }}>
                      <span className="bg-surface shadow-lift text-ink-2 grid size-[24px] place-items-center rounded-[7px]">
                        <CircleHelp size={13} strokeWidth={1.75} />
                      </span>
                      <span className="bg-surface shadow-lift text-accent-text grid size-[24px] place-items-center rounded-[7px]">
                        <Layers size={13} strokeWidth={1.75} />
                      </span>
                    </div>
                  </div>
                )}
                {PDF_PAGE.annotations.map(item => (
                  <div key={item.text} className="rounded-tau-sm flex w-full flex-col gap-1 px-2 py-2 text-left">
                    <span className={clsx("text-tau-sm text-ink-1 line-clamp-3 border-l-[3px] pl-2 leading-relaxed", item.border)}>{item.text}</span>
                    <span className="text-tau-meta text-ink-3 pl-0.5 tabular-nums">第 {item.page} 页</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden pt-6">
              <div className="mx-auto w-fit">
                <div
                  className="shadow-card outline-line-1 relative bg-white px-[64px] pt-[56px] pb-[60px] text-[#2b2620] outline"
                  style={{ width: 640, fontFamily: '"Songti SC", "Noto Serif SC Variable", serif' }}
                >
                  <div className="mb-1 text-[12px] tracking-[0.2em] text-[#9a8f80]">第三章</div>
                  <h2 className="mb-6 text-[26px] font-semibold tracking-[0.04em]">{PDF_PAGE.chapter}</h2>
                  {PDF_PAGE.paragraphs.map((p, i) => (
                    <p key={i} className="mb-4 text-justify text-[16px] leading-[2]" style={{ textIndent: "2em" }}>
                      {p.before}
                      {p.mark && (
                        <span
                          style={{
                            backgroundImage: `linear-gradient(${PDF_YELLOW}, ${PDF_YELLOW})`,
                            backgroundRepeat: "no-repeat",
                            backgroundSize: `${highlight * 100}% 100%`,
                            mixBlendMode: "multiply",
                          }}
                        >
                          {p.mark}
                        </span>
                      )}
                      {p.after}
                    </p>
                  ))}
                  <div className="absolute right-0 bottom-6 left-0 text-center text-[11px] text-[#b3a99b]">{PDF_PAGE.page}</div>
                  {toolbar > 0 && (
                    <div
                      className="absolute left-1/2"
                      style={{
                        top: PDF_PAGE.toolbarTop,
                        opacity: toolbar,
                        transform: `translate(-50%, ${(1 - toolbar) * 6}px) scale(${0.96 + toolbar * 0.04})`,
                        fontFamily: "var(--tau-font)",
                      }}
                    >
                      <FloatToolbar />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <Hud />
          </div>
        </div>
      </div>
    </div>
  );
}

const TOOL_BTN = "rounded-tau-sm text-tau-sm flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-ink-2";

function FloatToolbar() {
  const colors = ["bg-tag-4", "bg-tag-5", "bg-tag-1", "bg-tag-2", "bg-tag-3"];
  return (
    <div className="bg-surface shadow-float rounded-tau-md flex h-9 items-center gap-0.5 px-1.5">
      {colors.map((c, i) => (
        <span key={c} className="rounded-tau-sm grid size-7 shrink-0 place-items-center">
          <span className={clsx("text-ink-inverse grid size-[18px] place-items-center rounded-full", c, i === 0 && "ring-ink-1/20 ring-2")} />
        </span>
      ))}
      <span className={clsx(TOOL_BTN, "w-7 justify-center px-0")}>
        <Highlighter size={15} strokeWidth={1.75} />
      </span>
      <span className="bg-line-1 mx-1 h-4 w-px shrink-0" />
      <span className={TOOL_BTN}>
        <MessageSquarePlus size={15} strokeWidth={1.75} />
        写笔记
      </span>
      <span className={clsx(TOOL_BTN, "text-accent-text")}>
        <Sparkles size={15} strokeWidth={1.75} />问 AI
      </span>
      <span className={clsx(TOOL_BTN, "w-7 justify-center px-0")}>
        <Copy size={15} strokeWidth={1.75} />
      </span>
    </div>
  );
}

function Hud() {
  const icon = { size: 16, strokeWidth: 1.75 };
  const btn = "text-ink-2 grid size-8 place-items-center rounded-full";
  const sep = <span className="bg-line-1 mx-1 h-4 w-px" />;
  return (
    <div className="bg-surface shadow-float absolute bottom-4 left-1/2 z-30 flex h-10 -translate-x-1/2 items-center gap-0.5 rounded-full px-1.5">
      <span className={btn}>
        <PanelLeft {...icon} />
      </span>
      {sep}
      <span className={btn}>
        <ChevronUp {...icon} />
      </span>
      <span className="text-tau-sm text-ink-2 px-1 whitespace-nowrap tabular-nums">
        <b className="text-ink-1">{PDF_PAGE.page}</b> / 286
      </span>
      <span className={btn}>
        <ChevronDown {...icon} />
      </span>
      {sep}
      <span className={btn}>
        <Minus {...icon} />
      </span>
      <span className="text-tau-sm text-ink-2 px-1 tabular-nums">110%</span>
      <span className={btn}>
        <Plus {...icon} />
      </span>
      {sep}
      <span className={btn}>
        <Hand {...icon} />
      </span>
      <span className={btn}>
        <Search {...icon} />
      </span>
      <span className={btn}>
        <MoreHorizontal {...icon} />
      </span>
      {sep}
      <span className={clsx(btn, "text-accent")}>
        <MessageCircle {...icon} />
      </span>
    </div>
  );
}
