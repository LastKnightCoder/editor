import type { CollaborationSession } from "@tau/collaboration";
import { useStableSessionStatus } from "@tau/collaboration/src/view";
import { cn } from "@tau/ui";
import type { SaveState } from "./useEditorDocument";
import { useWindowStatusI18n } from "./window-status.i18n";
import { useCollaborationUiI18n, sessionStatusText } from "@/components/CollaborationUI/i18n";

/** 中文阅读速度口径：约 400 字 / 分钟 */
const WORDS_PER_MINUTE = 400;

const SAVE_DOTS: Record<SaveState, string> = {
  saved: "bg-ok",
  saving: "bg-accent",
  error: "bg-danger",
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
  const { t, locale } = useWindowStatusI18n();
  const context = useCollaborationUiI18n();
  const collab = useStableSessionStatus(session);
  const readingMinutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  const status = collab
    ? {
        label: t("collaboration", { state: sessionStatusText(collab, context) }),
        dot: TONE_DOTS[collab.tone] ?? "bg-ink-3",
      }
    : { label: t(`save.${saveState}`), dot: SAVE_DOTS[saveState] };

  return (
    <footer className="border-line-2 text-tau-micro text-ink-3 flex h-[30px] shrink-0 items-center gap-3.5 border-t px-3.5 tabular-nums">
      <span>
        <b className="text-ink-2 font-medium">{words.toLocaleString(locale)}</b>{" "}
        {t("characters", { count: words })}
      </span>
      {showReadingTime && words > 0 && (
        <span>
          {t("reading", { count: readingMinutes, amount: readingMinutes.toLocaleString(locale) })}
        </span>
      )}
      {selectedWords > 0 && (
        <span>
          {t("selected")}{" "}
          <b className="text-ink-2 font-medium">{selectedWords.toLocaleString(locale)}</b>{" "}
          {t("characters", { count: selectedWords })}
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
