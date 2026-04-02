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
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-400 dark:text-gray-500">
        暂无字幕
      </div>
    );
  }

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement | null>}
      className="flex-1 overflow-y-auto space-y-1 p-2"
    >
      {segments.map((segment, index) => (
        <div
          key={index}
          ref={(el) => {
            if (el) segmentRefsMap.current.set(index, el);
            else segmentRefsMap.current.delete(index);
          }}
          className={classNames(
            "flex flex-col gap-0.5 rounded-md p-2 cursor-pointer transition-colors",
            currentSegmentIndex === index
              ? "bg-blue-100 dark:bg-blue-900/30"
              : "hover:bg-gray-100 dark:hover:bg-zinc-800",
          )}
          onClick={() => onSegmentClick(segment)}
        >
          <span className="shrink-0 font-mono text-xs text-blue-500 dark:text-blue-400">
            {formatTime(segment.start)}
          </span>
          <span className="text-sm text-gray-700 dark:text-gray-300 break-words">
            {segment.text}
          </span>
        </div>
      ))}
    </div>
  );
};

export default TranscriptPanel;
