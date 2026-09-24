import { useMemo } from "react";
import { Clock } from "lucide-react";
import classNames from "classnames";
import { AudioChapter } from "@/types";

interface ChaptersPanelProps {
  chapters: AudioChapter[];
  currentTimeMs: number;
  onSeek: (timeMs: number) => void;
}

function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const ChaptersPanel = (props: ChaptersPanelProps) => {
  const { chapters, currentTimeMs, onSeek } = props;

  const activeChapterId = useMemo(() => {
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (currentTimeMs >= chapters[i].startTime) {
        return chapters[i].id;
      }
    }
    return chapters[0]?.id;
  }, [chapters, currentTimeMs]);

  if (chapters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-ink-2 flex items-center gap-1.5 px-1 text-xs font-semibold">
        <Clock className="size-[13px]" strokeWidth={1.75} />
        <span>章节</span>
      </div>
      <div className="flex flex-col gap-1">
        {chapters.map((chapter, index) => {
          const isActive = chapter.id === activeChapterId;
          return (
            <div
              key={chapter.id}
              className={classNames(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-all",
                isActive
                  ? "border-accent/40 bg-accent-soft"
                  : "hover:border-line-1 hover:bg-hover border-transparent"
              )}
              onClick={() => onSeek(chapter.startTime)}
            >
              <div
                className={classNames(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  isActive ? "bg-accent text-white" : "bg-sunken text-ink-2"
                )}
              >
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={classNames(
                    "text-sm font-medium leading-5",
                    isActive ? "text-accent-text" : "text-ink-1"
                  )}
                >
                  {chapter.title}
                </div>
                {chapter.summary && (
                  <div className="text-ink-2 mt-0.5 line-clamp-2 text-xs leading-4">
                    {chapter.summary}
                  </div>
                )}
              </div>
              <span className="text-ink-3 shrink-0 font-mono text-[11px] leading-5">
                {formatTimeMs(chapter.startTime)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChaptersPanel;
