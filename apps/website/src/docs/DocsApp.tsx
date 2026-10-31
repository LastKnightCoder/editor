import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor";
import type { DocCollection, DocEntry } from "./collection.ts";
import { DocsHeader } from "./DocsHeader.tsx";
import { DocsNav } from "./DocsNav.tsx";
import { DocsOutline } from "./DocsOutline.tsx";
import { DocsSearch } from "./DocsSearch.tsx";
import { getDocsKit } from "./editorKit.ts";
import { DocDemo } from "./showcase/DocDemo.tsx";
import {
  extractOutline,
  headingAnchors,
  queryHeadingElements,
  type OutlineItem,
} from "./outline.ts";
import { navigate, useHash, usePathname } from "./router.ts";

export type DocBlock =
  | { kind: "markdown"; value: Descendant[] }
  | { kind: "demo"; name: string; caption?: string };

/** 读一篇文档的正文；找不到时 reject */
export type DocLoader = (entry: DocEntry) => Promise<DocBlock[]>;

interface LoadedDoc {
  slug: string;
  blocks: DocBlock[];
  outline: OutlineItem[];
}

function createDocCache(load: DocLoader) {
  const loaded = new Map<string, Promise<LoadedDoc>>();
  return (entry: DocEntry) => {
    let pending = loaded.get(entry.slug);
    if (!pending) {
      pending = load(entry).then(blocks => ({
        slug: entry.slug,
        blocks,
        outline: blocks.flatMap(block =>
          block.kind === "markdown" ? extractOutline(block.value) : []
        ),
      }));
      // 失败的不缓存，下次进入重新加载
      pending.catch(() => loaded.delete(entry.slug));
      loaded.set(entry.slug, pending);
    }
    return pending;
  };
}

/** 标题越过吸顶导航下方这条线就算「正在读」 */
const READING_LINE = 60 + 72;

function useActiveHeading(doc: LoadedDoc | null) {
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
    if (!doc?.outline.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const headings = queryHeadingElements();
      let next = 0;
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= READING_LINE) next = index;
      });
      setActiveIndex(next);
    };
    const schedule = () => (frame ||= requestAnimationFrame(update));
    schedule();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
    };
  }, [doc]);
  return activeIndex;
}

function scrollToHeading(index: number, behavior: ScrollBehavior = "smooth") {
  const heading = queryHeadingElements()[index];
  if (!heading) return;
  scrollTo({
    top: heading.getBoundingClientRect().top + scrollY - (READING_LINE - 24),
    behavior,
  });
}

function useDocMeta(collection: DocCollection, entry: DocEntry | undefined) {
  useEffect(() => {
    document.title = entry ? collection.pageTitle(entry) : `页面不存在 · ${collection.name}`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", entry?.summary ?? collection.name);
  }, [collection, entry]);
}

/** 正文排版稳定（代码块等异步撑开高度）前，锚点跳转持续对齐的最长时间 */
const HASH_SETTLE_MS = 2000;

/** 地址带锚点时，正文渲染后滚到对应标题；排版仍在变时跟着对齐，用户自己滚动就停 */
function useHashScroll(doc: LoadedDoc | null) {
  const hash = useHash();
  useEffect(() => {
    if (!doc || !hash) return;
    const anchor = decodeURIComponent(hash.slice(1));
    const index = headingAnchors(doc.outline.map(item => item.title)).indexOf(anchor);
    if (index < 0) return;
    const align = () => scrollToHeading(index, "instant");
    const observer = new ResizeObserver(align);
    observer.observe(document.body);
    align();
    const stop = () => {
      observer.disconnect();
      clearTimeout(timer);
      for (const type of ["wheel", "touchstart", "keydown"])
        removeEventListener(type, stop, { capture: true });
    };
    const timer = setTimeout(stop, HASH_SETTLE_MS);
    for (const type of ["wheel", "touchstart", "keydown"])
      addEventListener(type, stop, { capture: true, passive: true });
    return stop;
  }, [doc, hash]);
}

function DocLink({
  href,
  entry,
  direction,
}: {
  href: string;
  entry: DocEntry;
  direction: "prev" | "next";
}) {
  const Icon = direction === "prev" ? ArrowLeft : ArrowRight;
  return (
    <a
      href={href}
      onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(href);
      }}
      className={`border-line-1 hover:border-accent group flex min-w-0 flex-1 flex-col gap-1 rounded-[12px] border px-4 py-3 transition-colors ${direction === "next" ? "items-end text-right" : ""}`}
    >
      <span className="text-ink-3 text-[12px]">{direction === "prev" ? "上一篇" : "下一篇"}</span>
      <span className="text-ink-1 group-hover:text-accent-text flex items-center gap-1.5 text-[15px] font-medium">
        {direction === "prev" && <Icon className="size-4" />}
        {entry.title}
        {direction === "next" && <Icon className="size-4" />}
      </span>
    </a>
  );
}

function DocArticle({
  collection,
  entry,
  loadDoc,
}: {
  collection: DocCollection;
  entry: DocEntry;
  loadDoc: (entry: DocEntry) => Promise<LoadedDoc>;
}) {
  const [doc, setDoc] = useState<LoadedDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadDoc(entry).then(
      next => !cancelled && setDoc(next),
      (reason: unknown) =>
        !cancelled && setError(reason instanceof Error ? reason.message : String(reason))
    );
    return () => {
      cancelled = true;
    };
  }, [entry, loadDoc]);

  const current = doc?.slug === entry.slug ? doc : null;
  const activeIndex = useActiveHeading(current);
  useHashScroll(current);
  const group = collection.groups.find(item => item.items.includes(entry));
  // 不进目录的文档没有上下篇
  const position = collection.entries.indexOf(entry);
  const prev = position < 0 ? undefined : collection.entries[position - 1];
  const next = position < 0 ? undefined : collection.entries[position + 1];

  return (
    <>
      <main className="min-w-0 flex-1 py-12 max-sm:py-8">
        <article className="mx-auto max-w-[760px]">
          <p className="text-accent-text text-[13px] font-medium tracking-[0.14em]">
            {group?.title}
          </p>
          <h1 className="mt-3 font-serif text-[38px] leading-tight font-semibold max-sm:text-[30px]">
            {entry.title}
          </h1>
          <p className="text-ink-2 mt-3 text-[16px] leading-relaxed">{entry.summary}</p>
          <div className="border-line-1 mt-8 min-h-[40vh] border-t pt-6">
            {error ? (
              <p role="alert" className="text-ink-2">
                正文加载失败：{error}。请刷新页面重试。
              </p>
            ) : (
              current && (
                <DndProvider backend={HTML5Backend}>
                  {current.blocks.map((block, index) =>
                    block.kind === "markdown" ? (
                      <Editor
                        key={`${current.slug}:${index}`}
                        kit={getDocsKit()}
                        initValue={block.value}
                        readonly
                      />
                    ) : (
                      <DocDemo
                        key={`${current.slug}:${index}`}
                        name={block.name}
                        caption={block.caption}
                      />
                    )
                  )}
                </DndProvider>
              )
            )}
          </div>
          {(prev || next) && (
            <div className="mt-16 flex gap-4 max-sm:flex-col">
              {prev ? (
                <DocLink href={collection.href(prev.slug)} entry={prev} direction="prev" />
              ) : (
                <span className="flex-1" />
              )}
              {next ? (
                <DocLink href={collection.href(next.slug)} entry={next} direction="next" />
              ) : (
                <span className="flex-1" />
              )}
            </div>
          )}
        </article>
      </main>
      <aside className="sticky top-[60px] hidden h-[calc(100dvh-60px)] w-[200px] shrink-0 overflow-y-auto py-12 xl:block">
        {current && current.outline.length > 0 && (
          <DocsOutline
            items={current.outline}
            activeIndex={activeIndex}
            onSelect={scrollToHeading}
          />
        )}
      </aside>
    </>
  );
}

function NotFound({ collection }: { collection: DocCollection }) {
  return (
    <main className="min-w-0 flex-1 py-24 text-center">
      <h1 className="font-serif text-[32px] font-semibold">没有找到这一页</h1>
      <p className="text-ink-2 mt-3">文档可能已经改名或移走了。</p>
      <a href={collection.href("")} className="text-accent-text mt-6 inline-block font-medium">
        回到文档首页
      </a>
    </main>
  );
}

/** 一个文档集的单页应用：左侧目录、中间正文、右侧本页大纲 */
export function DocsApp({
  collection,
  load,
  searchIndexUrl,
}: {
  collection: DocCollection;
  load: DocLoader;
  searchIndexUrl: string;
}) {
  const entry = collection.find(usePathname());
  const [loadDoc] = useState(() => createDocCache(load));
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  useDocMeta(collection, entry);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && closeNav();
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [navOpen, closeNav]);

  return (
    <div className="bg-page font-tau text-ink-1 min-h-dvh">
      <DocsHeader
        current={collection.site}
        nav={{ open: navOpen, onToggle: () => setNavOpen(open => !open) }}
        search={<DocsSearch collection={collection} indexUrl={searchIndexUrl} onOpen={closeNav} />}
      />
      {navOpen && entry && (
        <div className="bg-page fixed inset-x-0 top-[60px] bottom-0 z-30 overflow-y-auto px-4 py-6 lg:hidden">
          <DocsNav collection={collection} current={entry} onNavigate={closeNav} />
        </div>
      )}
      <div className="mx-auto flex max-w-[1440px] gap-12 px-6 max-sm:px-5">
        <aside className="sticky top-[60px] hidden h-[calc(100dvh-60px)] w-[220px] shrink-0 overflow-y-auto py-10 lg:block">
          {entry && <DocsNav collection={collection} current={entry} />}
        </aside>
        {entry ? (
          <DocArticle collection={collection} entry={entry} loadDoc={loadDoc} />
        ) : (
          <NotFound collection={collection} />
        )}
      </div>
    </div>
  );
}
