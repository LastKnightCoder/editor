import { NotebookPen } from "lucide-react";
import type { LocalNotePage } from "../local";
import { Badge, EmptyState } from "./parts";
import { formatTime, openCard } from "../helpers";
import { useLibraryI18n } from "../i18n";

const cardClass =
  "border-line-1 bg-surface hover:bg-surface-hover rounded-tau-md flex flex-col gap-1 border p-3 text-left";

/** 笔记汇总：本机草稿与已存成 Tau 卡片的笔记，按页面最近写过的在前 */
export function NotesView({
  notes,
  onEditDraft,
  onOpenPage,
}: {
  notes: LocalNotePage[];
  onEditDraft: (page: LocalNotePage) => void;
  onOpenPage: (url: string) => void;
}) {
  const context = useLibraryI18n();
  const { t, locale } = context;
  const drafts = notes.filter(page => page.draft !== null).length;
  const cards = notes.reduce((sum, page) => sum + page.saved.length, 0);

  return (
    <main className="bg-surface min-h-0 flex-1 overflow-y-auto">
      <header className="border-line-2 bg-surface sticky top-0 z-[1] border-b px-9 pt-6 pb-4">
        <h1 className="text-tau-title-lg text-ink-1 font-serif font-bold">{t("view.notes")}</h1>
        <p className="text-tau-sm text-ink-3 mt-1">
          {t("notes.summary", {
            drafts: drafts.toLocaleString(locale),
            cards: cards.toLocaleString(locale),
          })}
        </p>
      </header>
      {notes.length === 0 ? (
        <EmptyState icon={<NotebookPen size={22} strokeWidth={1.6} />}>
          {t("notes.empty")}
        </EmptyState>
      ) : (
        <div className="px-9 pt-2 pb-10">
          {notes.map(page => (
            <section key={page.url} aria-label={page.title || page.url}>
              <button
                type="button"
                onClick={() => onOpenPage(page.url)}
                className="text-tau-sm text-ink-2 hover:text-accent-text mt-5 mb-2 flex max-w-full items-center gap-1.5 font-semibold"
              >
                <span className="truncate">{page.title || page.url}</span>
              </button>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
                {page.draft !== null && (
                  <button type="button" className={cardClass} onClick={() => onEditDraft(page)}>
                    <span className="flex items-center gap-1.5">
                      <Badge tone="warn">{t("draft")}</Badge>
                    </span>
                    <span className="text-tau-meta text-ink-1 line-clamp-3">
                      {page.draft || t("noText")}
                    </span>
                    <span className="text-tau-sm text-ink-3 mt-auto flex justify-between pt-1">
                      {page.updatedAt ? formatTime(page.updatedAt, context) : t("localOnly")}
                      <span className="text-accent-text">{t("edit")}</span>
                    </span>
                  </button>
                )}
                {page.saved.map(card => (
                  <button
                    key={card.cardId}
                    type="button"
                    className={cardClass}
                    onClick={() => openCard(card.cardId)}
                  >
                    <span className="flex items-center gap-1.5">
                      <Badge tone="ok">{t("card")}</Badge>
                    </span>
                    <span className="text-tau-meta text-ink-1 line-clamp-3">
                      {card.preview || t("noText")}
                    </span>
                    <span className="text-tau-sm text-ink-3 mt-auto flex justify-between pt-1">
                      {formatTime(card.savedAt, context)}
                      <span className="text-accent-text">{t("openTau")}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
