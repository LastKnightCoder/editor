import { useRef, useState } from "react";
import { ArrowUpRight, Highlighter, NotebookPen, PencilLine } from "lucide-react";
import type { WebAnnotation, WebPageSummary } from "@tau/shared/browser-companion";
import { Button, toast } from "@tau/ui";
import type { LocalNotePage } from "../local";
import { usePageAnnotations, useRenamePage } from "../queries";
import { AnnotationItem, Badge, SiteMark } from "./parts";
import { formatTime, openCard, openPage, pageLabel } from "../helpers";

/** 按原文顺序；没有锚点的（早期标注）按时间排在后面 */
const byPosition = (a: WebAnnotation, b: WebAnnotation) =>
  (a.anchor?.position.start ?? Infinity) - (b.anchor?.position.start ?? Infinity) ||
  a.createdAt - b.createdAt;

function PageTitle({ page, canRename }: { page: WebPageSummary; canRename: boolean }) {
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
      { onError: error => toast.error(error instanceof Error ? error.message : "改名失败") }
    );
  };

  const titleClass = "text-tau-title-lg text-ink-1 font-serif font-bold leading-snug";
  return (
    <>
      {editing ? (
        <input
          aria-label="页面名称"
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
            title={canRename ? "点击重命名" : undefined}
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
          "回车保存 · Esc 取消 · 清空即恢复网页标题"
        ) : page.renamed ? (
          <>
            <span className="min-w-0 truncate">网页标题：{page.pageTitle || "（无）"}</span>
            {canRename && (
              <button
                type="button"
                className="text-accent-text flex-none"
                onClick={() => {
                  settled.current = false;
                  submit("");
                }}
              >
                恢复
              </button>
            )}
          </>
        ) : canRename ? null : (
          "连上 Tau 后可重命名"
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
  const annotations = usePageAnnotations(page.url);
  const items = [...(annotations.data ?? [])].sort(byPosition);
  const noted = items.filter(item => item.note.trim()).length;

  const summary = [
    items.length ? `${items.length} 条标注` : null,
    noted ? `${noted} 条批注` : null,
    notes?.saved.length ? `${notes.saved.length} 张卡片` : null,
    notes?.draft ? "有草稿" : null,
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
              打开网页
            </Button>
            <Button size="sm" icon={NotebookPen} onClick={onWriteNote}>
              {notes?.draft ? "继续写笔记" : "写笔记"}
            </Button>
          </div>
        </header>
        <div className="border-line-2 mt-6 grid grid-cols-[minmax(0,1fr)_260px] gap-10 border-t pt-2">
          <section aria-label="标注">
            <p className="text-tau-sm text-ink-3 mt-4 mb-1">标注</p>
            {annotations.isPending ? null : items.length === 0 ? (
              <p className="text-tau-meta text-ink-3 flex items-center gap-2 py-3">
                <Highlighter size={15} strokeWidth={1.8} className="flex-none" />
                还没有标注。打开网页，选中文字即可高亮或批注。
              </p>
            ) : (
              items.map(item => <AnnotationItem key={item.id} url={page.url} item={item} />)
            )}
          </section>
          <aside>
            <p className="text-tau-sm text-ink-3 mt-4 mb-2">笔记</p>
            {notes?.draft && (
              <button
                type="button"
                onClick={onWriteNote}
                className="border-line-1 hover:bg-surface-hover rounded-tau-md mb-2 block w-full border p-3 text-left"
              >
                <span className="flex items-center justify-between">
                  <Badge tone="warn">草稿</Badge>
                  <span className="text-tau-sm text-ink-3">
                    {notes.updatedAt ? formatTime(notes.updatedAt) : "仅本机"}
                  </span>
                </span>
                <span className="text-tau-meta text-ink-1 mt-2 line-clamp-4">{notes.draft}</span>
                <span className="text-tau-sm text-accent-text mt-2 block">继续编辑</span>
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
                  <Badge tone="ok">卡片</Badge>
                  <span className="text-tau-sm text-ink-3">{formatTime(card.savedAt)}</span>
                </span>
                <span className="text-tau-meta text-ink-1 mt-2 line-clamp-4">
                  {card.preview || "（无文字）"}
                </span>
                <span className="text-tau-sm text-accent-text mt-2 block">在 Tau 中打开</span>
              </button>
            ))}
            {!notes?.draft && !notes?.saved.length && (
              <button
                type="button"
                onClick={onWriteNote}
                className="text-tau-sm text-ink-3 border-line-1 hover:text-ink-2 hover:bg-surface-hover rounded-tau-md w-full border border-dashed p-3 text-center"
              >
                这一页还没有笔记，写一条
              </button>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
