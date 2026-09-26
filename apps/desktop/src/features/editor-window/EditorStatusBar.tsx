import type { CollaborationSession } from "@tau/collaboration";
import { useStableSessionStatus } from "@tau/collaboration/src/view";
import { cn } from "@tau/ui";
import type { SaveState } from "./useEditorDocument";

/** 中文阅读速度口径：约 400 字 / 分钟 */
const WORDS_PER_MINUTE = 400;

const SAVE_LABELS: Record<SaveState, { label: string; dot: string }> = {
  saved: { label: "已保存", dot: "bg-ok" },
  saving: { label: "保存中…", dot: "bg-accent" },
  error: { label: "保存失败，稍后重试", dot: "bg-danger" },
};

const TONE_DOTS: Record<string, string> = {
  live: "bg-ok",
  syncing: "bg-accent",
  offline: "bg-ink-3",
  idle: "bg-ink-3",
  error: "bg-danger",
};

/** 纸面底部状态栏：字数 / 阅读时长 / 选中字数 · 保存态（共享中换成协作连接态） */
export function EditorStatusBar({
  words,
  selectedWords,
  showReadingTime,
  saveState,
  session,
}: {
  words: number;
  selectedWords: number;
  showReadingTime: boolean;
  saveState: SaveState;
  session?: CollaborationSession;
}) {
  const collab = useStableSessionStatus(session);
  const status = collab
    ? { label: `协作中 · ${collab.label}`, dot: TONE_DOTS[collab.tone] ?? "bg-ink-3" }
    : SAVE_LABELS[saveState];

  return (
    <footer className="border-line-2 text-tau-micro text-ink-3 flex h-[30px] shrink-0 items-center gap-3.5 border-t px-3.5 tabular-nums">
      <span>
        <b className="text-ink-2 font-medium">{words.toLocaleString()}</b> 字
      </span>
      {showReadingTime && words > 0 && (
        <span>约 {Math.max(1, Math.round(words / WORDS_PER_MINUTE))} 分钟</span>
      )}
      {selectedWords > 0 && (
        <span>
          选中 <b className="text-ink-2 font-medium">{selectedWords.toLocaleString()}</b> 字
        </span>
      )}
      <span className="flex-1" />
      <span className="flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", status.dot)} />
        {status.label}
      </span>
    </footer>
  );
}
