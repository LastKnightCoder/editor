/**
 * 微信读书单本笔记：一整张纸——左侧目录停靠在纸内（开关钉在面包屑最前），
 * 正文列依次是书头、书评、吸顶过滤条、按章节排的划线与想法。只读：悬停只能复制。
 * 打开时先显示缓存，已连接则后台拉最新笔记并回写缓存。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Highlighter, PanelLeft } from "lucide-react";
import { IconButton, Loading, Tooltip, cn, toast } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { openExternal } from "@/commands/extra";
import { usePage, usePageBreadcrumb, usePageParams } from "@/page/PageProvider";
import {
  buildBookNotes,
  countNotes,
  filterNotes,
  notesToMarkdown,
  toBook,
  type HighlightColor,
  type NoteFilter,
} from "../model";
import { useWeReadBook, useWeReadConnection } from "../queries";
import { useWeReadPrefs } from "../prefs";
import {
  BookHeader,
  BookReviews,
  ChapterSection,
  NoteFilterBar,
  NoteToc,
} from "../components/NoteParts";

const PAGE_KEY = "weread-book";

export function WeReadBookView() {
  const { navigator } = usePage();
  const { bookId } = usePageParams<{ bookId: string }>();
  const connected = useWeReadConnection() === "valid";
  const { detail, loading, refreshing, refresh } = useWeReadBook(bookId);
  const tocOpen = useWeReadPrefs(s => s.tocOpen);
  const toggleToc = useWeReadPrefs(s => s.toggleToc);

  const [filter, setFilter] = useState<NoteFilter>("all");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  const book = useMemo(() => (detail ? toBook(detail.notebook) : null), [detail]);
  const notes = useMemo(() => (detail ? buildBookNotes(detail.notebook) : null), [detail]);
  const chapters = useMemo(() => (notes ? filterNotes(notes, filter) : []), [notes, filter]);
  const counts = useMemo(() => countNotes(notes?.chapters ?? []), [notes]);
  const colors = useMemo(() => {
    const set = new Set<HighlightColor>();
    notes?.chapters.forEach(ch => ch.notes.forEach(n => n.paragraphs.length && set.add(n.color)));
    return [...set];
  }, [notes]);
  const showToc = tocOpen && chapters.length > 1;

  const breadcrumb = useMemo(
    () => (
      <span className="text-tau-meta flex min-w-0 items-center gap-1.5">
        <Tooltip content={tocOpen ? "收起目录" : "展开目录"} placement="bottom">
          <IconButton
            className="shrink-0"
            onClick={toggleToc}
            aria-label={tocOpen ? "收起目录" : "展开目录"}
            aria-expanded={tocOpen}
          >
            <PanelLeft size={17} strokeWidth={1.75} />
          </IconButton>
        </Tooltip>
        <button
          type="button"
          onClick={() => navigator.push("weread", {})}
          className="text-ink-2 hover:bg-hover hover:text-ink-1 shrink-0 rounded-[6px] px-1.5 py-0.5"
        >
          微信读书
        </button>
        {book && (
          <>
            <span className="text-ink-3">/</span>
            <span className="text-ink-1 min-w-0 truncate font-medium">{book.title}</span>
          </>
        )}
      </span>
    ),
    [book, navigator, tocOpen, toggleToc]
  );
  usePageBreadcrumb(PAGE_KEY, breadcrumb);

  // 目录高亮：正文滚过的最后一个章节
  useEffect(() => {
    if (!scrollEl) return;
    const update = () => {
      const top = scrollEl.getBoundingClientRect().top + 72;
      let current: string | null = null;
      for (const el of scrollEl.querySelectorAll<HTMLElement>("[data-chapter]")) {
        if (el.getBoundingClientRect().top <= top) current = el.dataset.chapter ?? null;
        else break;
      }
      setActiveKey(current ?? chapters[0]?.key ?? null);
    };
    update();
    scrollEl.addEventListener("scroll", update, { passive: true });
    return () => scrollEl.removeEventListener("scroll", update);
  }, [scrollEl, chapters]);

  const jump = useCallback(
    (key: string) => {
      scrollEl
        ?.querySelector(`[data-chapter="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [scrollEl]
  );

  if (loading) return <Loading />;

  if (!detail || !book || !notes) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-ink-1 text-[15px] font-semibold">书架上找不到这本书</p>
        <p className="text-tau-meta text-ink-2">可能已从微信读书书架移除，或属于另一个工作区。</p>
      </div>
    );
  }

  const empty = notes.chapters.length === 0 && notes.bookReviews.length === 0;
  const status = detail.error
    ? `拉取失败，显示的是本地缓存：${detail.error}`
    : !connected
      ? "未连接微信读书，显示的是本地缓存"
      : null;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 overflow-hidden">
        {/* 外层只管收起动画的宽度，滚动交给 FadeScroll（其右侧透明边收起时也不占位） */}
        <div
          className={cn(
            "ease-tau-out flex shrink-0 overflow-hidden transition-[width,opacity] duration-[240ms]",
            showToc ? "w-[232px] opacity-100" : "w-0 opacity-0"
          )}
        >
          <FadeScroll className="my-4 w-[232px] shrink-0 py-1 pl-3.5 pr-1">
            {chapters.length > 1 && (
              <NoteToc chapters={chapters} active={activeKey} onJump={jump} />
            )}
          </FadeScroll>
        </div>
        <FadeScroll scrollRef={setScrollEl} className="my-4 min-w-0 flex-1">
          <div className="mx-auto max-w-[720px] px-9 pb-12 pt-3">
            <BookHeader
              book={book}
              counts={counts}
              connected={connected}
              refreshing={refreshing}
              onRefresh={refresh}
              onOpenWeb={book.webUrl ? () => void openExternal(book.webUrl) : undefined}
              onCopyMarkdown={
                empty
                  ? undefined
                  : () =>
                      void window.navigator.clipboard
                        .writeText(notesToMarkdown(book, notes))
                        .then(() => toast.success("已复制为 Markdown"))
              }
            />
            {status && <p className="text-tau-sm text-warn mt-3">{status}</p>}
            <BookReviews reviews={notes.bookReviews} />
            {empty ? (
              <div className="flex flex-col items-center gap-2 py-20 text-center">
                <Highlighter className="text-ink-3 size-7" strokeWidth={1.5} />
                <p className="text-ink-1 text-[15px] font-semibold">
                  {refreshing ? "正在拉取笔记…" : "这本书还没有划线"}
                </p>
                {!refreshing && (
                  <p className="text-tau-meta text-ink-2 max-w-[36ch]">
                    在微信读书里划线或写想法后，回到这里点「重新拉取笔记」。
                  </p>
                )}
              </div>
            ) : (
              <>
                <NoteFilterBar filter={filter} colors={colors} onChange={setFilter} />
                {chapters.map(chapter => (
                  <ChapterSection
                    key={chapter.key}
                    chapter={chapter}
                    index={notes.chapters.findIndex(c => c.key === chapter.key)}
                  />
                ))}
              </>
            )}
          </div>
        </FadeScroll>
      </div>
    </div>
  );
}
