import { useRef, useState } from "react";
import { ArrowUpRight, Highlighter, NotebookPen, PencilLine } from "lucide-react";
import type { WebAnnotation, WebPageSummary } from "@tau/shared/browser-companion";
import { Button, toast } from "@tau/ui";
import type { LocalNotePage } from "../local";
import { usePageAnnotations, useRenamePage } from "../queries";
import { AnnotationItem, Badge, SiteMark } from "./parts";
import { formatTime, openCard, openPage, pageLabel } from "../helpers";
import { useLibraryI18n, libraryErrorText } from "../i18n";

/** 按原文顺序；没有锚点的（早期标注）按时间排在后面 */
const byPosition = (a: WebAnnotation, b: WebAnnotation) =>
  (a.anchor?.position.start ?? Infinity) - (b.anchor?.position.start ?? Infinity) ||
  a.createdAt - b.createdAt;

function PageTitle({ page, canRename }: { page: WebPageSummary; canRename: boolean }) {
  const { t } = useLibraryI18n();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const rename = useRenamePage();
  // 回车 / Esc 之后输入框卸载可能再触发一次 blur，同一轮编辑只结算一次
  const settled = useRef(false);

  const startEditing = () => {
    settled.current = false;
    setText(page.title);
    setEditing(true);
  };

  const cancel = () => {
    settled.current = true;
    setEditing(false);
  };

  const submit = (title: string) => {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
    const next = title.trim();
    // 没改动，或在没改过名时清空，都不必写
    if (next === page.title || (!next && !page.renamed)) return;
    rename.mutate(
      { url: page.url, title: next },
      { onError: error => toast.error(libraryErrorText(error, "rename.failed")) }
    );
  };

  const titleClass = "text-tau-title-lg text-ink-1 font-serif font-bold leading-snug";
  return (
    <>
      {editing ? (
        <input
          aria-label={t("rename.name")}
          autoFocus
          value={text}
          maxLength={500}
          onChange={event => setText(event.target.value)}
          onFocus={event => event.target.select()}
          onBlur={() => submit(text)}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") submit(text);
            if (event.key === "Escape") cancel();
          }}
          className={`${titleClass} border-accent bg-surface rounded-tau-sm mt-2 -ml-1.5 w-full border px-1.5 outline-none focus-visible:shadow-[var(--tau-focus-ring)]`}
        />
      ) : (
        <h1 className="mt-2">
          <button
            type="button"
            disabled={!canRename}
            title={canRename ? t("rename.click") : undefined}
            onClick={startEditing}
            className={`${titleClass} enabled:hover:bg-hover rounded-tau-sm group -ml-1.5 inline-flex items-baseline gap-2 px-1.5 text-left`}
          >
            {pageLabel(page)}
            {canRename && (
              <PencilLine
                size={15}
                strokeWidth={1.8}
                className="text-ink-3 flex-none opacity-0 group-hover:opacity-100"
              />
            )}
          </button>
        </h1>
      )}
      <p className="text-tau-sm text-ink-3 mt-1 flex items-center gap-2 empty:hidden">
        {editing ? (
          t("rename.hint")
        ) : page.renamed ? (
          <>
            <span className="min-w-0 truncate">
              {t("rename.original", { title: page.pageTitle || t("none") })}
            </span>
            {canRename && (
              <button
                type="button"
                className="text-accent-text flex-none"
                onClick={() => {
                  settled.current = false;
                  submit("");
                }}
              >
                {t("rename.restore")}
              </button>
            )}
          </>
        ) : canRename ? null : (
          t("rename.offline")
        )}
      </p>
    </>
  );
}

export function PageDetail({
  page,
  canRename,
  notes,
  onWriteNote,
}: {
  page: WebPageSummary;
  canRename: boolean;
  notes: LocalNotePage | undefined;
  onWriteNote: () => void;
}) {
  const context = useLibraryI18n();
  const { t, locale } = context;
  const hasDraft = Boolean(notes && notes.draft !== null);
  const annotations = usePageAnnotations(page.url);
  const items = [...(annotations.data ?? [])].sort(byPosition);
  const noted = items.filter(item => item.note.trim()).length;

  const summary = [
    items.length
      ? t("annotations", { count: items.length, amount: items.length.toLocaleString(locale) })
      : null,
    noted ? t("comments", { count: noted, amount: noted.toLocaleString(locale) }) : null,
    notes?.saved.length
      ? t("cards", { count: notes.saved.length, amount: notes.saved.length.toLocaleString(locale) })
      : null,
    hasDraft ? t("hasDraft") : null,
  ].filter(Boolean);

  return (
    <main className="bg-surface min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1040px] px-10 pt-7 pb-12">
        <header>
          <p className="text-tau-sm text-ink-3 flex min-w-0 items-center gap-1.5" title={page.url}>
            <SiteMark host={page.host} />
            <span className="truncate">{page.host.replace(/^www\./, "")}</span>
            {summary.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="flex-none">{summary.join(" · ")}</span>
              </>
            )}
          </p>
          <PageTitle key={page.url} page={page} canRename={canRename} />
          <div className="mt-4 flex gap-1.5">
            <Button
              size="sm"
              variant="primary"
              icon={ArrowUpRight}
              onClick={() => openPage(page.url)}
            >
              {t("page.open")}
            </Button>
            <Button size="sm" icon={NotebookPen} onClick={onWriteNote}>
              {hasDraft ? t("page.continueNote") : t("page.writeNote")}
            </Button>
          </div>
        </header>
        <div className="border-line-2 mt-6 grid grid-cols-[minmax(0,1fr)_260px] gap-10 border-t pt-2">
          <section aria-label={t("page.annotations")}>
            <p className="text-tau-sm text-ink-3 mt-4 mb-1">{t("page.annotations")}</p>
            {annotations.isPending ? null : items.length === 0 ? (
              <p className="text-tau-meta text-ink-3 flex items-center gap-2 py-3">
                <Highlighter size={15} strokeWidth={1.8} className="flex-none" />
                {t("page.emptyAnnotations")}
              </p>
            ) : (
              items.map(item => <AnnotationItem key={item.id} url={page.url} item={item} />)
            )}
          </section>
          <aside>
            <p className="text-tau-sm text-ink-3 mt-4 mb-2">{t("view.notes")}</p>
            {notes && notes.draft !== null && (
              <button
                type="button"
                onClick={onWriteNote}
                className="border-line-1 hover:bg-surface-hover rounded-tau-md mb-2 block w-full border p-3 text-left"
              >
                <span className="flex items-center justify-between">
                  <Badge tone="warn">{t("draft")}</Badge>
                  <span className="text-tau-sm text-ink-3">
                    {notes.updatedAt ? formatTime(notes.updatedAt, context) : t("localOnly")}
                  </span>
                </span>
                <span className="text-tau-meta text-ink-1 mt-2 line-clamp-4">
                  {notes.draft || t("noText")}
                </span>
                <span className="text-tau-sm text-accent-text mt-2 block">{t("edit")}</span>
              </button>
            )}
            {notes?.saved.map(card => (
              <button
                key={card.cardId}
                type="button"
                onClick={() => openCard(card.cardId)}
                className="border-line-1 hover:bg-surface-hover rounded-tau-md mb-2 block w-full border p-3 text-left"
              >
                <span className="flex items-center justify-between">
                  <Badge tone="ok">{t("card")}</Badge>
                  <span className="text-tau-sm text-ink-3">
                    {formatTime(card.savedAt, context)}
                  </span>
                </span>
                <span className="text-tau-meta text-ink-1 mt-2 line-clamp-4">
                  {card.preview || t("noText")}
                </span>
                <span className="text-tau-sm text-accent-text mt-2 block">{t("openTau")}</span>
              </button>
            ))}
            {!hasDraft && !notes?.saved.length && (
              <button
                type="button"
                onClick={onWriteNote}
                className="text-tau-sm text-ink-3 border-line-1 hover:text-ink-2 hover:bg-surface-hover rounded-tau-md w-full border border-dashed p-3 text-center"
              >
                {t("page.emptyNote")}
              </button>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
