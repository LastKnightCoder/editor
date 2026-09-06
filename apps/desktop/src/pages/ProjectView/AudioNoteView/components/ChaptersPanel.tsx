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
      <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
        <Clock size={13} />
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
                  ? "border-[var(--th-border-focus)]/40 bg-[var(--th-accent-soft)]"
                  : "border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
              )}
              onClick={() => onSeek(chapter.startTime)}
            >
              <div
                className={classNames(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  isActive
                    ? "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] dark:bg-[var(--th-accent)]"
                    : "bg-gray-200 text-gray-600 dark:bg-zinc-700 dark:text-gray-300"
                )}
              >
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={classNames(
                    "text-sm font-medium leading-5",
                    isActive ? "text-[var(--th-active-text)]" : "text-gray-800 dark:text-gray-200"
                  )}
                >
                  {chapter.title}
                </div>
                {chapter.summary && (
                  <div className="mt-0.5 line-clamp-2 text-xs leading-4 text-gray-500 dark:text-gray-400">
                    {chapter.summary}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-mono text-[11px] leading-5 text-gray-400 dark:text-gray-500">
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
