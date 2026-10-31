import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { Dialog } from "@tau/ui";
import type { DocCollection } from "./collection.ts";
import { navigate } from "./router.ts";
import type { DocSearchEngine, DocSearchHit, SearchTextPart } from "./search.ts";

type SearchRuntime = typeof import("./search.ts");

function Highlight({ parts }: { parts: SearchTextPart[] }) {
  return parts.map((part, index) =>
    part.match ? (
      <mark key={index} className="bg-accent-soft text-accent-text rounded-sm">
        {part.text}
      </mark>
    ) : (
      part.text
    )
  );
}

function SearchResult({ hit, runtime }: { hit: DocSearchHit; runtime: SearchRuntime }) {
  const { item, matches } = hit;
  const parts = (field: "title" | "section" | "content" | "summary", maxLength?: number) =>
    runtime.searchTextParts(
      item[field],
      matches?.find(match => match.key === field)?.indices,
      maxLength
    );
  const excerpt = matches?.some(match => match.key === "content")
    ? "content"
    : item.summary
      ? "summary"
      : "content";
  return (
    <>
      <span className="text-ink-3 block text-[12px]">{item.group}</span>
      <span className="text-ink-1 mt-1 block font-medium">
        <Highlight parts={parts("title")} />
        {item.section && (
          <>
            {" "}
            <span className="text-ink-3">›</span> <Highlight parts={parts("section")} />
          </>
        )}
      </span>
      <span className="text-ink-2 mt-1 block text-[13px] leading-relaxed">
        <Highlight parts={parts(excerpt, 140)} />
      </span>
    </>
  );
}

export function DocsSearch({
  collection,
  indexUrl,
  onOpen,
}: {
  collection: DocCollection;
  indexUrl: string;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [loaded, setLoaded] = useState<{ runtime: SearchRuntime; search: DocSearchEngine } | null>(
    null
  );
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const resultsId = useId();
  const resultsRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hits = useMemo(() => loaded?.search(deferredQuery) ?? [], [loaded, deferredQuery]);
  const active = Math.min(activeIndex, Math.max(0, hits.length - 1));

  const openSearch = () => {
    onOpen();
    setOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "k" ||
        !(event.metaKey || event.ctrlKey) ||
        (event.target instanceof Element &&
          event.target.closest(
            "input, textarea, select, [contenteditable]:not([contenteditable=false])"
          ))
      )
        return;
      event.preventDefault();
      triggerRef.current?.click();
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    setError(false);
    import("./search.ts")
      .then(async runtime => ({
        runtime,
        search: await runtime.loadDocSearch(indexUrl, collection.basePath),
      }))
      .then(
        next => !cancelled && setLoaded(next),
        () => !cancelled && setError(true)
      );
    return () => {
      cancelled = true;
    };
  }, [open, loaded, indexUrl, collection.basePath, attempt]);

  useEffect(() => {
    if (open) resultsRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, hits]);

  const select = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`搜索${collection.name}`}
        aria-haspopup="dialog"
        onClick={openSearch}
        className="text-ink-2 border-line-1 hover:bg-hover inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px]"
      >
        <Search className="size-4" />
        <span className="max-md:hidden">搜索文档</span>
        <kbd className="text-ink-3 text-[11px] max-lg:hidden">⌘ / Ctrl K</kbd>
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`搜索${collection.name}`}
        width={640}
        header={
          <div className="border-line-1 flex items-center gap-3 border-b px-4 py-3">
            <Search className="text-ink-3 size-5 shrink-0" />
            <input
              data-autofocus
              type="search"
              role="combobox"
              aria-label={`搜索${collection.name}`}
              aria-autocomplete="list"
              aria-controls={resultsId}
              aria-expanded={Boolean(hits.length)}
              aria-activedescendant={hits.length ? `${resultsId}-${active}` : undefined}
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={event => {
                if (event.nativeEvent.isComposing) return;
                if ((event.key === "ArrowDown" || event.key === "ArrowUp") && hits.length) {
                  event.preventDefault();
                  setActiveIndex(
                    (active + (event.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length
                  );
                } else if (event.key === "Enter" && hits[active] && query === deferredQuery) {
                  event.preventDefault();
                  select(hits[active].item.href);
                }
              }}
              placeholder="搜索标题、正文或 API…"
              className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent py-1 text-[16px] outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭搜索"
              className="text-ink-3 hover:text-ink-1 grid size-8 shrink-0 place-items-center rounded-[8px]"
            >
              <X className="size-4" />
            </button>
          </div>
        }
      >
        <div className="min-h-0 overflow-y-auto p-2">
          <p role="status" className="text-ink-3 px-3 py-3 text-[13px]">
            {error
              ? "搜索加载失败，请重试。"
              : !loaded
                ? "正在加载搜索…"
                : !query.trim()
                  ? `搜索${collection.name}的全部公开文档`
                  : hits.length
                    ? `找到 ${hits.length} 个相关章节`
                    : "没有找到相关文档，试试其他关键词。"}
            {error && (
              <button
                type="button"
                onClick={() => setAttempt(value => value + 1)}
                className="text-accent-text ml-2 underline"
              >
                重试
              </button>
            )}
          </p>
          <ul id={resultsId} ref={resultsRef} role="listbox" aria-label="搜索结果">
            {loaded &&
              hits.map((hit, index) => (
                <li
                  key={hit.item.href}
                  id={`${resultsId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                >
                  <a
                    href={hit.item.href}
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={event => {
                      if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey ||
                        event.button !== 0
                      )
                        return;
                      event.preventDefault();
                      select(hit.item.href);
                    }}
                    className={`flex items-center gap-4 rounded-[10px] px-3 py-3 ${index === active ? "bg-hover" : "hover:bg-hover"}`}
                  >
                    <span className="min-w-0 flex-1 break-words">
                      <SearchResult hit={hit} runtime={loaded.runtime} />
                    </span>
                    <ArrowUpRight className="text-ink-3 size-4 shrink-0" />
                  </a>
                </li>
              ))}
          </ul>
        </div>
        <p className="text-ink-3 border-line-1 border-t px-5 py-3 text-[12px]">
          ↑ ↓ 选择 · Enter 打开 · Esc 关闭
        </p>
      </Dialog>
    </>
  );
}
