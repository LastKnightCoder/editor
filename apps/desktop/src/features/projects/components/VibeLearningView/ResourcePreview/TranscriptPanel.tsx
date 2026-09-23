import classNames from "classnames";
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
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  segments,
  currentSegmentIndex,
  containerRef,
  segmentRefsMap,
  onSegmentClick,
}) => {
  if (!segments || segments.length === 0) {
    return <div className="text-ink-3 flex items-center justify-center py-8 text-sm">暂无字幕</div>;
  }

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement | null>}
      className="flex-1 space-y-1 overflow-y-auto p-2"
    >
      {segments.map((segment, index) => (
        <div
          key={index}
          ref={el => {
            if (el) segmentRefsMap.current.set(index, el);
            else segmentRefsMap.current.delete(index);
          }}
          className={classNames(
            "flex cursor-pointer flex-col gap-0.5 rounded-md p-2 transition-colors",
            currentSegmentIndex === index ? "bg-info/15 dark:" : "hover:bg-hover"
          )}
          onClick={() => onSegmentClick(segment)}
        >
          <span className="text-accent shrink-0 font-mono text-xs">
            {formatTime(segment.start)}
          </span>
          <span className="text-ink-2 break-words text-sm">{segment.text}</span>
        </div>
      ))}
    </div>
  );
};

export default TranscriptPanel;
