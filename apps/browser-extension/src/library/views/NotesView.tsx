import { NotebookPen } from "lucide-react";
import type { LocalNotePage } from "../local";
import { Badge, EmptyState } from "./parts";
import { formatTime, openCard } from "../helpers";

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
  const drafts = notes.filter(page => page.draft).length;
  const cards = notes.reduce((sum, page) => sum + page.saved.length, 0);

  return (
    <main className="bg-surface min-h-0 flex-1 overflow-y-auto">
      <header className="border-line-2 bg-surface sticky top-0 z-[1] border-b px-9 pt-6 pb-4">
        <h1 className="text-tau-title-lg text-ink-1 font-serif font-bold">笔记</h1>
        <p className="text-tau-sm text-ink-3 mt-1">
          {drafts} 份草稿在本机 · {cards} 张已存入 Tau
        </p>
      </header>
      {notes.length === 0 ? (
        <EmptyState icon={<NotebookPen size={22} strokeWidth={1.6} />}>
          还没有页面笔记：在伴读面板的「笔记」页签里记下想法
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
                {page.draft && (
                  <button type="button" className={cardClass} onClick={() => onEditDraft(page)}>
                    <span className="flex items-center gap-1.5">
                      <Badge tone="warn">草稿</Badge>
                    </span>
                    <span className="text-tau-meta text-ink-1 line-clamp-3">{page.draft}</span>
                    <span className="text-tau-sm text-ink-3 mt-auto flex justify-between pt-1">
                      {page.updatedAt ? formatTime(page.updatedAt) : "仅本机"}
                      <span className="text-accent-text">继续编辑</span>
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
                      <Badge tone="ok">卡片</Badge>
                    </span>
                    <span className="text-tau-meta text-ink-1 line-clamp-3">
                      {card.preview || "（无文字）"}
                    </span>
                    <span className="text-tau-sm text-ink-3 mt-auto flex justify-between pt-1">
                      {formatTime(card.savedAt)}
                      <span className="text-accent-text">在 Tau 中打开</span>
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
