/**
 * 视频笔记左栏的字幕区，结构摘自 components/MediaTranscript/TranscriptPanel 与 VideoNoteView/MaterialColumn。
 * 章节名吸顶作段头；当前句整行选中底、时间染强调色；已摘录的句子留浅色强调底；划选后上方出工具条。
 * 滚动由调用方给（scrollTop），用真实滚动而不是位移，章节段头的吸顶才成立。
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { Copy, LocateFixed, NotebookPen, Play, Sparkles } from "lucide-react";
import { Pressed } from "./Dialog";
import type { Segment } from "../../mock/videonote";

/** 字幕里的时间：mm:ss，分补零 */
export const transcriptTime = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** 每句所属章节下标（章节按 start 升序）；第一句之前没有章节段头 */
const chapterIndexes = (segments: Segment[], chapters: { start: number; title: string }[]) => {
  let chapter = -1;
  return segments.map(segment => {
    while (chapter + 1 < chapters.length && chapters[chapter + 1].start <= segment.start) chapter++;
    return Math.max(chapter, 0);
  });
};

export type TranscriptSelection = {
  /** 选中的句子下标 */
  index: number;
  /** 划选进度 0→1（底色从左往右铺开） */
  progress: number;
  /** 工具条出现 0→1 */
  toolbar?: number;
  pressed?: "quote" | "ask" | "play" | "copy";
};

const ICON = { size: 15, strokeWidth: 1.75 } as const;

function SelectionButton({ accent, children, hit, pressed }: { accent?: boolean; children?: ReactNode; hit: string; pressed?: boolean }) {
  return (
    <span data-hit={hit}>
      <Pressed on={!!pressed}>
        <span
          className={clsx(
            "rounded-tau-sm text-tau-sm ease-tau-out flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap",
            children ? "px-2" : "w-7 justify-center",
            accent ? "text-accent-text hover:bg-accent-soft" : "text-ink-2 hover:bg-hover hover:text-ink-1"
          )}
        >
          {children}
        </span>
      </Pressed>
    </span>
  );
}

/**
 * 一句字幕的文字。segment.quote 是会被摘录的那几个字（缺省整句）：划选的底色和摘录后的浅底只落在它上面，
 * 两端各有一个零宽的锚点（select-from / select-to），光标划选时从这儿拖到那儿。
 */
function SegmentText({ segment, marked, selecting, anchors }: { segment: Segment; marked: boolean; selecting: number; anchors?: number }) {
  const quote = segment.quote ?? segment.text;
  const at = segment.text.indexOf(quote);
  if (at < 0) return <span>{segment.text}</span>;
  const highlight = marked
    ? "var(--tau-accent-soft)"
    : selecting > 0
      ? `linear-gradient(90deg, color-mix(in srgb, var(--tau-accent) 30%, transparent) ${selecting * 100}%, transparent ${selecting * 100}%)`
      : undefined;
  return (
    <>
      {segment.text.slice(0, at)}
      {anchors !== undefined && <i data-hit={`select-from:${anchors}`} className="inline-block h-[1em] w-0 align-middle" />}
      <span className={clsx((marked || selecting > 0) && "rounded-[3px]")} style={{ background: highlight }}>
        {quote}
      </span>
      {segment.text.slice(at + quote.length)}
      {anchors !== undefined && <i data-hit={`select-to:${anchors}`} className="inline-block h-[1em] w-0 align-middle" />}
    </>
  );
}

export function TranscriptList({
  segments,
  chapters,
  current,
  quoted,
  scroll = 0,
  selection,
  selectHits,
  reveal = 1,
  chaptersReveal = 1,
  className,
}: {
  segments: Segment[];
  chapters: { start: number; title: string }[];
  /** 当前句的下标 */
  current: number | null;
  /** 已摘到笔记的句子 */
  quoted: number[];
  /** 容器滚过的像素 */
  scroll?: number;
  selection?: TranscriptSelection;
  /** 给哪几句放划选锚点（只有会被划选的句子需要） */
  selectHits?: number[];
  /** 转录刚完成时各句依次淡入 0→1 */
  reveal?: number;
  /** 章节段头刚分好时撑开高度淡入 0→1，字幕平滑往下让，不跳 */
  chaptersReveal?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = scroll;
  });
  // 工具条停在选区那一行的左上方 44px：按真实排版量（offsetTop 不受滚动影响），再减去容器滚过的像素
  const row = selection ? rowRefs.current[selection.index] : null;
  const toolbarLeft = row ? Math.max(8, row.offsetLeft + 12 + 56 + 12) : 8;
  const toolbarTop = row ? row.offsetTop - scroll - 44 : 0;
  const owners = chapters.length ? chapterIndexes(segments, chapters) : null;
  const toolbar = selection?.toolbar ?? 0;
  return (
    <div data-hit="transcript-viewport" className={clsx("relative flex min-h-0 flex-1 flex-col", className)}>
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden">
        <div data-hit="transcript-content" className="flex flex-col gap-px px-3 pt-1 pb-6">
          {segments.map((segment, index) => {
            const active = current === index;
            const isQuoted = quoted.includes(index);
            const selecting = selection?.index === index && selection.progress > 0;
            const chapter = owners && chapters && owners[index] !== owners[index - 1] ? chapters[owners[index]] : null;
            const anchor = selectHits?.includes(index);
            const shown = reveal >= 1 ? 1 : Math.max(0, Math.min(1, reveal * (segments.length + 3) - index));
            return (
              <div key={index} style={shown < 1 ? { opacity: shown, transform: `translateY(${(1 - shown) * 6}px)` } : undefined}>
                {chapter && (
                  <div
                    data-hit={`chapter-head:${owners![index]}`}
                    className="bg-surface text-tau-sm text-ink-1 sticky top-0 z-[1] flex items-baseline gap-2 overflow-hidden px-3 pt-3 pb-1.5 font-semibold"
                    style={chaptersReveal < 1 ? { maxHeight: 44 * chaptersReveal, opacity: chaptersReveal, paddingTop: 12 * chaptersReveal, paddingBottom: 6 * chaptersReveal } : undefined}
                  >
                    <span className="text-ink-3 font-tau-mono font-normal tabular-nums">{transcriptTime(chapter.start)}</span>
                    <span className="min-w-0 truncate">{chapter.title}</span>
                  </div>
                )}
                <div
                  ref={element => {
                    rowRefs.current[index] = element;
                  }}
                  data-segment-index={index}
                  data-hit={`segment:${index}`}
                  className={clsx("grid cursor-pointer grid-cols-[56px_1fr] gap-3 rounded-[8px] px-3 py-1.5 transition-colors", active ? "bg-selected" : "hover:bg-hover")}
                >
                  <span className={clsx("text-tau-sm pt-px font-mono tabular-nums", active ? "text-accent-text" : "text-ink-3")}>{transcriptTime(segment.start)}</span>
                  <span className={clsx("text-tau-body break-words leading-relaxed", active ? "text-ink-1" : "text-ink-2")}>
                    {anchor ? (
                      <SegmentText segment={segment} marked={isQuoted} selecting={selecting ? selection.progress : 0} anchors={index} />
                    ) : (
                      <SegmentText segment={segment} marked={isQuoted} selecting={0} />
                    )}
                    {isQuoted && (
                      <span title="已摘到笔记" className="text-accent-text ml-1 inline-block align-[-1px]">
                        <NotebookPen className="size-3" strokeWidth={1.75} />
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selection && toolbar > 0 && (
        <div
          role="toolbar"
          aria-label="转录选区"
          className="bg-surface shadow-float rounded-tau-md absolute z-20 flex h-9 items-center gap-0.5 px-1.5"
          style={{ left: toolbarLeft, top: toolbarTop, opacity: toolbar, transform: `translateY(${(1 - toolbar) * 4}px)` }}
        >
          <SelectionButton accent hit="toolbar:quote" pressed={selection.pressed === "quote"}>
            <NotebookPen {...ICON} />
            摘到笔记
          </SelectionButton>
          <SelectionButton hit="toolbar:ask" pressed={selection.pressed === "ask"}>
            <Sparkles {...ICON} />
            问 AI
          </SelectionButton>
          <span aria-hidden className="bg-line-1 mx-1 h-4 w-px shrink-0" />
          <SelectionButton hit="toolbar:play" pressed={selection.pressed === "play"}>
            <Play {...ICON} />
          </SelectionButton>
          <SelectionButton hit="toolbar:copy" pressed={selection.pressed === "copy"}>
            <Copy {...ICON} />
          </SelectionButton>
        </div>
      )}
    </div>
  );
}

/** 「回到当前播放」：当前句被滚出视口时出现在右下角 */
export function BackToCurrent({ appear = 0 }: { appear?: number }) {
  if (appear <= 0) return null;
  return (
    <button
      type="button"
      className="bg-surface shadow-lift text-tau-sm text-ink-1 absolute right-4 bottom-3 z-10 flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full px-3"
      style={{ opacity: appear, transform: `translateY(${(1 - appear) * 6}px)` }}
    >
      <LocateFixed className="text-accent-text size-3.5" strokeWidth={1.75} />
      回到当前播放
    </button>
  );
}
