import { cn } from "@tau/ui";
import { FadeScroll } from "@tau/ui";
import { formatTime } from "./useTranscriptSync";

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

interface TranscriptPanelProps {
  segments: TranscriptSegment[] | null | undefined;
  currentSegmentIndex: number | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  segmentRefsMap: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  onSegmentClick: (segment: TranscriptSegment) => void;
  /** 列表内层的宽度 / 留白（缺省为阅读区居中 760 列） */
  innerClassName?: string;
  /** 滚动视口的附加类（如纸面内视口内缩：tau-sheet-scroll、渐隐尺寸） */
  className?: string;
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  segments,
  currentSegmentIndex,
  containerRef,
  segmentRefsMap,
  onSegmentClick,
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

  return (
    <FadeScroll scrollRef={containerRef} className={cn("min-h-0 flex-1", className)}>
      <div className={cn("flex flex-col gap-px", innerClassName)}>
        {segments.map((segment, index) => (
          <div
            key={index}
            ref={el => {
              if (el) segmentRefsMap.current.set(index, el);
              else segmentRefsMap.current.delete(index);
            }}
            className={cn(
              "grid cursor-pointer grid-cols-[56px_1fr] gap-3 rounded-[8px] px-3 py-1.5 transition-colors",
              currentSegmentIndex === index ? "bg-selected" : "hover:bg-hover"
            )}
            onClick={() => onSegmentClick(segment)}
          >
            <span
              className={cn(
                "text-tau-sm pt-px font-mono tabular-nums",
                currentSegmentIndex === index ? "text-accent-text" : "text-ink-3"
              )}
            >
              {formatTime(segment.start)}
            </span>
            <span
              className={cn(
                "text-tau-body break-words leading-relaxed",
                currentSegmentIndex === index ? "text-ink-1" : "text-ink-2"
              )}
            >
              {segment.text}
            </span>
          </div>
        ))}
      </div>
    </FadeScroll>
  );
};

export default TranscriptPanel;
