import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@tau/ui";
import { formatTime } from "@tau/shared";
import type { PodcastScriptLine } from "@/types/podcast";
import { findCurrentLineIndex, type SpeakerTone } from "./speakers";

export const SPEAKER_TEXT_CLASSES: Record<SpeakerTone, string> = {
  1: "text-tag-1",
  2: "text-tag-2",
  3: "text-tag-3",
  4: "text-tag-4",
  5: "text-tag-5",
};

interface PodcastScriptProps {
  lines: PodcastScriptLine[];
  /** 没有逐句脚本的旧播客，只能展开纯文本 */
  fallbackScript?: string;
  tones: Map<string, SpeakerTone>;
  currentTime: number;
  onSeek: (time: number) => void;
}

/**
 * 播客脚本跟读：收起时是一行当前句字幕，展开为逐句列表（当前句高亮并自动滚到可视区，点句子跳转播放）。
 * 指针停留在列表上时不自动滚动，避免和用户手动翻看打架。
 */
export default function PodcastScript({
  lines,
  fallbackScript,
  tones,
  currentTime,
  onSeek,
}: PodcastScriptProps) {
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const hoveringRef = useRef(false);
  const currentIndex = findCurrentLineIndex(lines, currentTime);

  const scrollToCurrent = (behavior: ScrollBehavior) => {
    const list = listRef.current;
    const line = list?.querySelector<HTMLElement>(`[data-line="${currentIndex}"]`);
    if (!list || !line) return;
    list.scrollTo({ top: line.offsetTop - list.clientHeight / 3, behavior });
  };

  // 展开瞬间直接定位到当前句
  useLayoutEffect(() => {
    if (expanded) scrollToCurrent("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (expanded && !hoveringRef.current) scrollToCurrent("smooth");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  if (lines.length === 0 && !fallbackScript) {
    return null;
  }

  const toggle = (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded(open => !open)}
      className="text-ink-3 hover:bg-hover hover:text-ink-1 text-tau-sm rounded-tau-sm flex shrink-0 items-center gap-0.5 px-1.5 py-0.5 transition-colors"
    >
      {expanded ? "收起脚本" : "展开脚本"}
      <ChevronDown size={13} className={cn("transition-transform", expanded && "rotate-180")} />
    </button>
  );

  if (lines.length === 0) {
    return (
      <div className="mt-2">
        <div className="flex justify-end">{toggle}</div>
        {expanded && (
          <div className="border-line-1 text-ink-2 text-tau-body mt-1 max-h-[260px] select-text overflow-auto whitespace-pre-wrap border-t pt-2 leading-relaxed">
            {fallbackScript}
          </div>
        )}
      </div>
    );
  }

  const current = lines[currentIndex];

  return (
    <div className="mt-2">
      {expanded ? (
        <div
          ref={listRef}
          onPointerEnter={() => (hoveringRef.current = true)}
          onPointerLeave={() => (hoveringRef.current = false)}
          className="border-line-1 relative max-h-[260px] overflow-auto border-t pt-1.5"
        >
          {lines.map((line, index) => {
            const tone = tones.get(line.speaker) ?? 1;
            const isCurrent = index === currentIndex;
            return (
              <button
                key={index}
                type="button"
                data-line={index}
                onClick={() => onSeek(line.startTime)}
                className={cn(
                  "rounded-tau-sm grid w-full grid-cols-[44px_1fr] gap-x-2.5 px-2 py-1.5 text-left transition-colors",
                  isCurrent ? "bg-accent-soft" : "hover:bg-hover"
                )}
              >
                <span
                  className={cn(
                    "font-tau-mono text-tau-micro pt-0.5 tabular-nums",
                    isCurrent ? "text-accent-text" : "text-ink-3"
                  )}
                >
                  {formatTime(line.startTime)}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn("text-tau-sm block font-semibold", SPEAKER_TEXT_CLASSES[tone])}
                  >
                    {line.speaker}
                  </span>
                  <span
                    className={cn(
                      "text-tau-body block select-text leading-relaxed",
                      isCurrent ? "text-ink-1" : index < currentIndex ? "text-ink-3" : "text-ink-2"
                    )}
                  >
                    {line.text}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-hover rounded-tau-sm flex items-start gap-2.5 px-2.5 py-2">
          <span
            className={cn(
              "text-tau-sm shrink-0 pt-px font-semibold",
              SPEAKER_TEXT_CLASSES[tones.get(current.speaker) ?? 1]
            )}
          >
            {current.speaker}
          </span>
          <span className="text-ink-1 text-tau-body line-clamp-2 min-w-0 flex-1 select-text">
            {current.text}
          </span>
        </div>
      )}
      <div className="mt-1 flex justify-center">{toggle}</div>
    </div>
  );
}
