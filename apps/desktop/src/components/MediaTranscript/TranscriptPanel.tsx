import { Fragment } from "react";
import { NotebookPen } from "lucide-react";
import { cn } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { formatTime } from "./useTranscriptSync";

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

/** 章节段头：起点毫秒 + 标题 */
export interface TranscriptChapter {
  start: number;
  title: string;
}

interface TranscriptPanelProps {
  segments: TranscriptSegment[] | null | undefined;
  currentSegmentIndex: number | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  segmentRefsMap: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  onSegmentClick: (segment: TranscriptSegment) => void;
  /** 按章节分组，章节名作吸顶段头 */
  chapters?: TranscriptChapter[];
  /** 已摘到笔记的句子：留浅色底 */
  quotedIndexes?: ReadonlySet<number>;
  /** 列表内层的宽度 / 留白（缺省为阅读区居中 760 列） */
  innerClassName?: string;
  /** 滚动视口的附加类（如纸面内视口内缩：tau-sheet-scroll、渐隐尺寸） */
  className?: string;
}

/** 每句所属章节下标（章节按 start 升序） */
const chapterIndexes = (segments: TranscriptSegment[], chapters: TranscriptChapter[]) => {
  let chapter = -1;
  return segments.map(segment => {
    while (chapter + 1 < chapters.length && chapters[chapter + 1].start <= segment.start) chapter++;
    return Math.max(chapter, 0);
  });
};

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  segments,
  currentSegmentIndex,
  containerRef,
  segmentRefsMap,
  onSegmentClick,
  chapters,
  quotedIndexes,
  innerClassName = "mx-auto max-w-[760px] px-6 pb-10 pt-2",
  className,
}) => {
  if (!segments || segments.length === 0) {
    return (
      <div className="text-tau-meta text-ink-3 flex items-center justify-center py-10">
        还没有字幕，转录完成后会出现在这里
      </div>
    );
  }

  const owners = chapters?.length ? chapterIndexes(segments, chapters) : null;

  return (
    <FadeScroll scrollRef={containerRef} className={cn("min-h-0 flex-1", className)}>
      <div className={cn("flex flex-col gap-px", innerClassName)}>
        {segments.map((segment, index) => {
          const current = currentSegmentIndex === index;
          const quoted = quotedIndexes?.has(index);
          const chapter =
            owners && chapters && owners[index] !== owners[index - 1]
              ? chapters[owners[index]]
              : null;
          return (
            <Fragment key={index}>
              {chapter && (
                <div className="bg-surface text-tau-sm text-ink-1 sticky top-0 z-[1] flex items-baseline gap-2 px-3 pt-3 pb-1.5 font-semibold">
                  <span className="text-ink-3 font-tau-mono font-normal tabular-nums">
                    {formatTime(chapter.start)}
                  </span>
                  <span className="min-w-0 truncate">{chapter.title}</span>
                </div>
              )}
              <div
                ref={el => {
                  if (el) segmentRefsMap.current.set(index, el);
                  else segmentRefsMap.current.delete(index);
                }}
                data-segment-index={index}
                className={cn(
                  "grid cursor-pointer grid-cols-[56px_1fr] gap-3 rounded-[8px] px-3 py-1.5 transition-colors",
                  current ? "bg-selected" : "hover:bg-hover"
                )}
                onClick={() => {
                  // 划选文字的 mouseup 也会触发 click：有选区时不跳播
                  if (window.getSelection()?.toString()) return;
                  onSegmentClick(segment);
                }}
              >
                <span
                  className={cn(
                    "text-tau-sm pt-px font-mono tabular-nums",
                    current ? "text-accent-text" : "text-ink-3"
                  )}
                >
                  {formatTime(segment.start)}
                </span>
                <span
                  className={cn(
                    "text-tau-body break-words leading-relaxed",
                    current ? "text-ink-1" : "text-ink-2"
                  )}
                >
                  <span className={cn(quoted && "bg-accent-soft rounded-[3px]")}>
                    {segment.text}
                  </span>
                  {quoted && (
                    <span
                      title="已摘到笔记"
                      className="text-accent-text ml-1 inline-block align-[-1px]"
                    >
                      <NotebookPen className="size-3" strokeWidth={1.75} />
                    </span>
                  )}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
    </FadeScroll>
  );
};

export default TranscriptPanel;
