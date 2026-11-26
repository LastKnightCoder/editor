import { Code2 } from "lucide-react";
import { cn } from "@tau/ui";
import { FileBanner } from "../FileChrome";
import { useMarkdownChromeI18n } from "../chrome.i18n";
import { useMarkdownFileI18n } from "../file.i18n";

export function MarkdownBodyLabel({ id }: { id: string }) {
  const { t } = useMarkdownFileI18n();
  return (
    <span id={id} className="sr-only">
      {t("file.body")}
    </span>
  );
}
export function MarkdownLoadError({ reason }: { reason: string }) {
  const { t } = useMarkdownChromeI18n();
  return (
    <div className="text-tau-meta text-ink-2 grid flex-1 place-items-center px-8 text-center">
      {t("chrome.loadFailed", { reason })}
    </div>
  );
}
export function MarkdownProjectionBanner({ error, kind }: { error: string; kind?: "conversion" }) {
  const { t } = useMarkdownFileI18n();
  return (
    <FileBanner tone="warn" actions={[]}>
      {t("file.richUnavailable", {
        reason: kind === "conversion" ? t("file.conversionUnavailable") : error,
      })}
    </FileBanner>
  );
}
export function MarkdownConflictBanner({
  loadExternal,
  keepMine,
}: {
  loadExternal(): void;
  keepMine(): Promise<void>;
}) {
  const { t } = useMarkdownChromeI18n();
  return (
    <FileBanner
      tone="warn"
      actions={[
        { id: "load-external", label: t("chrome.loadExternal"), onClick: loadExternal },
        {
          id: "keep-mine",
          label: t("chrome.keepMine"),
          primary: true,
          onClick: () => void keepMine(),
        },
      ]}
    >
      {t("chrome.conflict")}
    </FileBanner>
  );
}
export function MarkdownMissingBanner({
  resave,
  saveAs,
}: {
  resave(): Promise<void>;
  saveAs(): void;
}) {
  const { t } = useMarkdownChromeI18n();
  return (
    <FileBanner
      tone="danger"
      actions={[
        { id: "resave", label: t("chrome.resave"), onClick: () => void resave() },
        { id: "save-as", label: t("chrome.saveAs"), onClick: saveAs },
      ]}
    >
      {t("chrome.missing")}
    </FileBanner>
  );
}
export function MarkdownSourceButton({
  sourceMode,
  toggle,
}: {
  sourceMode: boolean;
  toggle(): void;
}) {
  const { t } = useMarkdownFileI18n();
  return (
    <button
      type="button"
      onClick={toggle}
      onMouseDown={event => {
        if (event.button === 0) event.preventDefault();
      }}
      title={t(sourceMode ? "file.exitSourceMode" : "file.sourceMode")}
      aria-pressed={sourceMode}
      className={cn(
        "grid h-5 w-[22px] place-items-center rounded-[6px] transition-colors",
        sourceMode
          ? "bg-selected text-accent-text"
          : "text-ink-3 hover:bg-hover hover:text-ink-1 opacity-70 hover:opacity-100"
      )}
    >
      <Code2 className="size-[13px]" strokeWidth={1.75} />
    </button>
  );
}
export function MarkdownTextStats({
  words,
  wordsPerMinute,
}: {
  words: number;
  wordsPerMinute: number;
}) {
  const { t, locale } = useMarkdownFileI18n();
  return (
    <>
      <span>
        <b className="text-ink-2 font-medium">{words.toLocaleString(locale)}</b>{" "}
        {t("file.characters", { count: words })}
      </span>
      {words > 0 && (
        <span>
          {t("file.readingTime", { count: Math.max(1, Math.round(words / wordsPerMinute)) })}
        </span>
      )}
    </>
  );
}
