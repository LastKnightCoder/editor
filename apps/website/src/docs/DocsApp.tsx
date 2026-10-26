import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor";
import { DocsHeader } from "./DocsHeader.tsx";
import { DocsNav } from "./DocsNav.tsx";
import { DocsOutline } from "./DocsOutline.tsx";
import { getDocsKit } from "./editorKit.ts";
import { docsMarkdown } from "./editorMarkdown.ts";
import {
  DOC_ENTRIES,
  DOC_GROUPS,
  docHref,
  docPageTitle,
  findDoc,
  type DocEntry,
} from "./manifest.ts";
import { DocDemo } from "./showcase/DocDemo.tsx";
import { extractOutline, queryHeadingElements, type OutlineItem } from "./outline.ts";
import { navigate, usePathname } from "./router.ts";
import { splitDocSegments } from "./segments.ts";

const sources = import.meta.glob<string>("../../content/docs/*.md", {
  query: "?raw",
  import: "default",
});

type LoadedBlock =
  | { kind: "markdown"; value: Descendant[] }
  | { kind: "demo"; name: string; caption?: string };

interface LoadedDoc {
  slug: string;
  blocks: LoadedBlock[];
  outline: OutlineItem[];
}

const loaded = new Map<string, Promise<LoadedDoc>>();

function loadDoc(entry: DocEntry): Promise<LoadedDoc> {
  let pending = loaded.get(entry.slug);
  if (!pending) {
    const source = sources[`../../content/docs/${entry.slug || "index"}.md`];
    pending = source
      ? source().then(markdown => {
          const blocks = splitDocSegments(markdown).map<LoadedBlock>(segment =>
            segment.kind === "markdown"
              ? {
                  kind: "markdown",
                  value: docsMarkdown.importFromMarkdown(segment.markdown),
                }
              : segment
          );
          const outline = blocks.flatMap(block =>
            block.kind === "markdown" ? extractOutline(block.value) : []
          );
          return { slug: entry.slug, blocks, outline };
        })
      : Promise.reject(new Error(`缺少文档正文：${entry.slug || "index"}.md`));
    // 失败的不缓存，下次进入重新加载
    pending.catch(() => loaded.delete(entry.slug));
    loaded.set(entry.slug, pending);
  }
  return pending;
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

function scrollToHeading(index: number) {
  const heading = queryHeadingElements()[index];
  if (!heading) return;
  scrollTo({
    top: heading.getBoundingClientRect().top + scrollY - (READING_LINE - 24),
    behavior: "smooth",
  });
}

function useDocMeta(entry: DocEntry | undefined) {
  useEffect(() => {
    document.title = entry ? docPageTitle(entry) : "页面不存在 · Tau 使用文档";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", entry?.summary ?? "Tau 使用文档");
  }, [entry]);
}

function DocLink({ entry, direction }: { entry: DocEntry; direction: "prev" | "next" }) {
  const Icon = direction === "prev" ? ArrowLeft : ArrowRight;
  return (
    <a
      href={docHref(entry.slug)}
      onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(docHref(entry.slug));
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

function DocArticle({ entry }: { entry: DocEntry }) {
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
  }, [entry]);

  const current = doc?.slug === entry.slug ? doc : null;
  const activeIndex = useActiveHeading(current);
  const group = DOC_GROUPS.find(item => item.items.includes(entry));
  // 不进目录的文档没有上下篇
  const position = DOC_ENTRIES.indexOf(entry);
  const prev = position < 0 ? undefined : DOC_ENTRIES[position - 1];
  const next = position < 0 ? undefined : DOC_ENTRIES[position + 1];

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
              {prev ? <DocLink entry={prev} direction="prev" /> : <span className="flex-1" />}
              {next ? <DocLink entry={next} direction="next" /> : <span className="flex-1" />}
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

function NotFound() {
  return (
    <main className="min-w-0 flex-1 py-24 text-center">
      <h1 className="font-serif text-[32px] font-semibold">没有找到这一页</h1>
      <p className="text-ink-2 mt-3">文档可能已经改名或移走了。</p>
      <a href={docHref("")} className="text-accent-text mt-6 inline-block font-medium">
        回到文档首页
      </a>
    </main>
  );
}

export function DocsApp() {
  const entry = findDoc(usePathname());
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  useDocMeta(entry);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && closeNav();
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, [navOpen, closeNav]);

  return (
    <div className="bg-page font-tau text-ink-1 min-h-dvh">
      <DocsHeader
        current="docs"
        nav={{ open: navOpen, onToggle: () => setNavOpen(open => !open) }}
      />
      {navOpen && entry && (
        <div className="bg-page fixed inset-x-0 top-[60px] bottom-0 z-30 overflow-y-auto px-4 py-6 lg:hidden">
          <DocsNav current={entry} onNavigate={closeNav} />
        </div>
      )}
      <div className="mx-auto flex max-w-[1440px] gap-12 px-6 max-sm:px-5">
        <aside className="sticky top-[60px] hidden h-[calc(100dvh-60px)] w-[220px] shrink-0 overflow-y-auto py-10 lg:block">
          {entry && <DocsNav current={entry} />}
        </aside>
        {entry ? <DocArticle entry={entry} /> : <NotFound />}
      </div>
    </div>
  );
}
