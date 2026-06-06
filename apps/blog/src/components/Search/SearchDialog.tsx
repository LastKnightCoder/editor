import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import classNames from "classnames";
import { AlertCircle, Clock, FileSearch, Search, X } from "lucide-react";
import type { FuseResultMatch } from "fuse.js";

import { joinPath } from "@blog/utils";
import {
  clearRecentSearchQueries,
  loadBlogSearchIndex,
  readRecentSearchQueries,
  saveRecentSearchQuery,
  type BlogSearchIndex,
  type BlogSearchResult,
} from "@blog/utils/search";

interface SearchDialogProps {
  open: boolean;
  searchHref: string;
  basePath: string;
  onClose: () => void;
}

type LoadState = "idle" | "loading" | "ready" | "error";
type SearchMatch = FuseResultMatch;

const MAX_SNIPPET_LENGTH = 110;

function getMatchValue(result: BlogSearchResult, key: string): string {
  const match = result.matches?.find((item: SearchMatch) => item.key === key);
  if (match?.value) {
    return match.value;
  }

  const item = result.item;
  if (key === "summary") {
    return item.summary;
  }
  if (key === "content") {
    return item.content;
  }
  return item.title;
}

function findBestSnippetKey(result: BlogSearchResult): "summary" | "content" {
  const hasSummaryMatch = result.matches?.some(
    (match: SearchMatch) => match.key === "summary",
  );
  return hasSummaryMatch ? "summary" : "content";
}

function clampSnippet(value: string, match?: FuseResultMatch): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_SNIPPET_LENGTH) {
    return normalized;
  }

  const firstMatchStart = match?.indices?.[0]?.[0] ?? 0;
  const start = Math.max(0, firstMatchStart - 28);
  const snippet = normalized.slice(start, start + MAX_SNIPPET_LENGTH);
  const prefix = start > 0 ? "..." : "";
  const suffix = start + MAX_SNIPPET_LENGTH < normalized.length ? "..." : "";
  return `${prefix}${snippet}${suffix}`;
}

function renderHighlighted(value: string, match?: FuseResultMatch): ReactNode {
  if (!match || match.indices.length === 0) {
    return value;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  match.indices.forEach(([start, end], index) => {
    if (start > cursor) {
      parts.push(value.slice(cursor, start));
    }
    parts.push(
      <mark
        key={`${start}-${end}-${index}`}
        className="rounded bg-[var(--color-accent-subtle)] px-0.5 text-[var(--color-text-primary)]"
      >
        {value.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  });

  if (cursor < value.length) {
    parts.push(value.slice(cursor));
  }

  return parts;
}

function SearchResultItem({
  result,
  active,
  basePath,
  onOpen,
  onHover,
}: {
  result: BlogSearchResult;
  active: boolean;
  basePath: string;
  onOpen: () => void;
  onHover: () => void;
}) {
  const titleMatch = result.matches?.find(
    (match: SearchMatch) => match.key === "title",
  );
  const snippetKey = findBestSnippetKey(result);
  const snippetMatch = result.matches?.find(
    (match: SearchMatch) => match.key === snippetKey,
  );
  const snippet = clampSnippet(getMatchValue(result, snippetKey), snippetMatch);

  return (
    <a
      href={joinPath(basePath, result.item.href)}
      onClick={(event) => {
        event.preventDefault();
        onOpen();
      }}
      onMouseEnter={onHover}
      className={classNames(
        "block rounded-md px-3 py-2.5 transition-colors",
        active
          ? "bg-[var(--color-bg-canvas)]"
          : "hover:bg-[var(--color-bg-canvas)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded border border-[var(--color-border-ring)] px-1.5 py-0.5 text-[11px] leading-4 text-[var(--color-text-tertiary)]">
          {result.item.typeLabel}
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-[var(--color-text-primary)]">
          {renderHighlighted(result.item.title, titleMatch)}
        </span>
      </div>
      {snippet && (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">
          {renderHighlighted(snippet)}
        </p>
      )}
    </a>
  );
}

const SearchDialog = ({
  open,
  searchHref,
  basePath,
  onClose,
}: SearchDialogProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [searchIndex, setSearchIndex] = useState<BlogSearchIndex | null>(null);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    setRecentQueries(readRecentSearchQueries());
    window.requestAnimationFrame(() => inputRef.current?.focus());

    if (searchIndex) {
      return;
    }

    let cancelled = false;
    setLoadState("loading");
    loadBlogSearchIndex(searchHref)
      .then((loadedIndex) => {
        if (cancelled) return;
        setSearchIndex(loadedIndex);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [open, searchHref, searchIndex]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const normalizedQuery = query.trim();
  const results = useMemo(
    () =>
      normalizedQuery && searchIndex ? searchIndex.search(normalizedQuery) : [],
    [normalizedQuery, searchIndex],
  );
  const visibleRecentQueries = normalizedQuery ? [] : recentQueries;
  const selectableCount = normalizedQuery
    ? results.length
    : visibleRecentQueries.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  useEffect(() => {
    if (activeIndex >= selectableCount) {
      setActiveIndex(Math.max(0, selectableCount - 1));
    }
  }, [activeIndex, selectableCount]);

  const openResult = (result: BlogSearchResult) => {
    if (normalizedQuery) {
      setRecentQueries(saveRecentSearchQuery(normalizedQuery));
    }
    window.location.href = joinPath(basePath, result.item.href);
  };

  const openRecentQuery = (recentQuery: string) => {
    setQuery(recentQuery);
    setRecentQueries(saveRecentSearchQuery(recentQuery));
  };

  const handleClearRecent = () => {
    clearRecentSearchQueries();
    setRecentQueries([]);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        selectableCount > 0 ? (index + 1) % selectableCount : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        selectableCount > 0
          ? (index - 1 + selectableCount) % selectableCount
          : 0,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (normalizedQuery && results[activeIndex]) {
        openResult(results[activeIndex]);
        return;
      }
      if (!normalizedQuery && visibleRecentQueries[activeIndex]) {
        openRecentQuery(visibleRecentQueries[activeIndex]);
      }
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] bg-[rgba(20,18,16,0.16)] px-3 pt-[72px] sm:pt-[86px]"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div
        className="mx-auto flex max-h-[min(620px,78vh)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-[var(--color-border-ring-heavy)] bg-[var(--color-bg-container)] shadow-[0_18px_60px_rgba(28,25,23,0.13),0_2px_8px_rgba(28,25,23,0.06)]"
        role="dialog"
        aria-modal="true"
        aria-label="搜索"
      >
        <div className="flex h-12 items-center gap-3 border-b border-[var(--color-border-ring)] px-3">
          <Search
            className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
            placeholder="搜索文章、卡片、文档、求索录"
            aria-label="搜索关键词"
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]"
            aria-label="关闭搜索"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {loadState === "loading" && (
            <div className="flex items-center gap-2 px-3 py-5 text-sm text-[var(--color-text-tertiary)]">
              <FileSearch className="h-4 w-4" aria-hidden="true" />
              正在加载搜索索引...
            </div>
          )}

          {loadState === "error" && (
            <div className="flex items-center gap-2 px-3 py-5 text-sm text-[var(--color-text-tertiary)]">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              搜索暂时不可用，请稍后再试。
            </div>
          )}

          {loadState === "ready" && normalizedQuery && results.length === 0 && (
            <div className="px-3 py-5 text-sm text-[var(--color-text-tertiary)]">
              没有找到相关内容
            </div>
          )}

          {loadState === "ready" && normalizedQuery && results.length > 0 && (
            <div className="space-y-1">
              {results.map((result, index) => (
                <SearchResultItem
                  key={`${result.item.type}-${result.item.id}`}
                  result={result}
                  active={activeIndex === index}
                  basePath={basePath}
                  onOpen={() => openResult(result)}
                  onHover={() => setActiveIndex(index)}
                />
              ))}
            </div>
          )}

          {loadState !== "loading" &&
            !normalizedQuery &&
            visibleRecentQueries.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-3 pb-1 pt-2">
                  <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
                    最近搜索
                  </span>
                  <button
                    type="button"
                    onClick={handleClearRecent}
                    className="text-xs text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-primary)]"
                  >
                    清空
                  </button>
                </div>
                <div className="space-y-1">
                  {visibleRecentQueries.map((recentQuery, index) => (
                    <button
                      key={recentQuery}
                      type="button"
                      onClick={() => openRecentQuery(recentQuery)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={classNames(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        activeIndex === index
                          ? "bg-[var(--color-bg-canvas)] text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]",
                      )}
                    >
                      <Clock
                        className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 truncate">{recentQuery}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

          {loadState !== "loading" &&
            !normalizedQuery &&
            visibleRecentQueries.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--color-text-tertiary)]">
                <FileSearch className="h-4 w-4" aria-hidden="true" />
                输入关键词开始搜索
              </div>
            )}
        </div>

        <div className="hidden items-center gap-3 border-t border-[var(--color-border-ring)] px-3 py-2 text-[11px] text-[var(--color-text-tertiary)] sm:flex">
          <span>
            <kbd className="rounded border border-[var(--color-border-ring)] px-1 py-0.5 font-mono">
              ↑↓
            </kbd>{" "}
            选择
          </span>
          <span>
            <kbd className="rounded border border-[var(--color-border-ring)] px-1 py-0.5 font-mono">
              Enter
            </kbd>{" "}
            打开
          </span>
          <span>
            <kbd className="rounded border border-[var(--color-border-ring)] px-1 py-0.5 font-mono">
              Esc
            </kbd>{" "}
            关闭
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SearchDialog;
