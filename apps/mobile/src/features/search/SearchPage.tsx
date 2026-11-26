import { useSearchI18n, type MobileSearchKey } from "./i18n";
import { useState, useRef, useEffect } from "react";
import { Search, SearchX, Trash2 } from "lucide-react";
import { useSearchHistory } from "../../hooks/useSearchHistory";
import { useEdgeFade } from "../../hooks/useScrollState";
import type { UnifiedSearchResponse, UnifiedSearchResult } from "../../types";
import { SearchField } from "../../components/SearchField";
import { useMobileEntityHostRevision } from "../../services/pluginEntities";
import { EntityKindIcon } from "../context/EntityKindIcon";
import { Puzzle } from "lucide-react";

type SearchPageProps = {
  onClose: () => void;
  onSearch: (query: string, page?: number) => Promise<UnifiedSearchResponse>;
  onOpenResult: (result: UnifiedSearchResult) => void;
  isSearching: boolean;
};

function relativeTime(ts: number, locale: string, justNow: string): string {
  if (!ts) return "";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const minutes = Math.floor((Date.now() - normalized) / 60_000);
  if (minutes < 1) return justNow;
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (minutes < 60) return relative.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return relative.format(-days, "day");
  return new Intl.DateTimeFormat(locale).format(normalized);
}

const RESULT_TYPE_KEYS: Record<string, MobileSearchKey> = {
  card: "type.card",
  article: "type.article",
  "project-item": "type.project-item",
  "diary-daily": "type.diary-daily",
  flashcard: "type.flashcard",
  "plugin-entity": "type.plugin-entity",
};

function SearchResultItem({ item, onClick }: { item: UnifiedSearchResult; onClick: () => void }) {
  const { t, locale } = useSearchI18n();
  const label =
    item.pluginEntity?.label ||
    (RESULT_TYPE_KEYS[item.type] ? t(RESULT_TYPE_KEYS[item.type]) : item.type);
  return (
    <button
      type="button"
      onClick={onClick}
      className="card w-full p-4 text-left transition-transform duration-200 active:scale-[0.97]"
    >
      <div className="flex items-center gap-2">
        <span className="bg-accent-soft text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">
          {item.type === "plugin-entity" && (
            <EntityKindIcon svg={item.pluginEntity?.icon} fallback={Puzzle} size={13} />
          )}
          {label}
        </span>
        {item.containerTitle && item.type !== "diary-daily" ? (
          <span className="text-ink-3 max-w-[45%] truncate text-[11.5px]">
            {item.containerTitle}
          </span>
        ) : null}
        {item.updateTime && (
          <span className="text-ink-3 ml-auto text-[11.5px]">
            {relativeTime(item.updateTime, locale, t("time.justNow"))}
          </span>
        )}
      </div>
      <p className="text-ink-1 mt-2 line-clamp-1 text-[14px] font-bold">
        {item.title ||
          item.excerpt ||
          t("result.fallback", { type: label || t("type.content"), id: item.id })}
      </p>
      {item.excerpt && (
        <p className="text-ink-2 mt-1 line-clamp-2 text-[12.5px] leading-relaxed">{item.excerpt}</p>
      )}
    </button>
  );
}

export function SearchPage({ onClose, onSearch, onOpenResult, isSearching }: SearchPageProps) {
  const { t, locale } = useSearchI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedSearchResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const hostRevision = useMobileEntityHostRevision();
  const inputRef = useRef<HTMLInputElement>(null);
  // 请求序号：快速连续搜索时只保留最后一次的结果，防止乱序覆盖
  const searchSeqRef = useRef(0);
  const { history, addHistory, clearHistory } = useSearchHistory();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    searchSeqRef.current++;
    setResults(null);
    setHasSearched(false);
    setLoadingMore(false);
    setMoreError(false);
  }, [hostRevision]);

  const handleSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const seq = ++searchSeqRef.current;
    setHasSearched(true);
    setLoadingMore(false);
    setMoreError(false);
    addHistory(trimmed);
    const searchResults = await onSearch(trimmed);
    if (seq !== searchSeqRef.current) return;
    setResults(searchResults);
  };

  const loadMore = async () => {
    if (!results || loadingMore) return;
    const previous = results;
    const seq = searchSeqRef.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const next = await onSearch(previous.query, previous.page + 1);
      if (seq !== searchSeqRef.current) return;
      if (next.page !== previous.page + 1 || next.query !== previous.query) {
        setMoreError(true);
        return;
      }
      const seen = new Set(previous.items.map(item => `${item.type}:${item.id}`));
      setResults({
        ...next,
        items: [
          ...previous.items,
          ...next.items.filter(item => !seen.has(`${item.type}:${item.id}`)),
        ],
      });
    } catch {
      if (seq === searchSeqRef.current) setMoreError(true);
    } finally {
      if (seq === searchSeqRef.current) setLoadingMore(false);
    }
  };

  const handleHistoryClick = (historyQuery: string) => {
    setQuery(historyQuery);
    void handleSearch(historyQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      void handleSearch(query);
    }
  };

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      {/* 搜索栏 */}
      <div className="mobile-topbar topbar-immersive flex items-center gap-3 px-4 pb-3">
        <SearchField
          inputRef={inputRef}
          tone="surface"
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          className="flex-1"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-ink-2 active:text-ink-1 shrink-0 text-[14px] font-semibold"
        >
          {t("cancel")}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto overscroll-contain"
        >
          {!hasSearched && history.length > 0 ? (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="text-ink-1 text-[14px] font-extrabold">{t("history")}</h3>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-ink-3 active:text-ink-1 p-1 transition-colors"
                  aria-label={t("history.clear")}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="list-group">
                {history.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleHistoryClick(item)}
                    className="list-item gap-3 px-4 text-left"
                  >
                    <span className="text-ink-3">
                      <Search size={17} aria-hidden="true" />
                    </span>
                    <span className="text-ink-1 flex-1 truncate text-[14px] font-medium">
                      {item}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {hasSearched && (
            <div className="p-4">
              {isSearching && !loadingMore ? (
                <div className="py-12 text-center">
                  <div className="border-accent mx-auto h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" />
                  <p className="text-ink-3 mt-3 text-sm">{t("searching")}</p>
                </div>
              ) : results?.items.length ? (
                <div className="space-y-3">
                  <p className="text-ink-3 px-1 text-[12.5px] font-semibold">
                    {t("results", {
                      count: results.total,
                      amount: results.total.toLocaleString(locale),
                    })}
                  </p>
                  {results.items.map(item => (
                    <SearchResultItem
                      key={`${item.type}:${item.id}`}
                      item={item}
                      onClick={() => onOpenResult(item)}
                    />
                  ))}
                  {results.page * results.pageSize < results.total && (
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => void loadMore()}
                      className="text-accent w-full rounded-xl py-3 text-sm disabled:opacity-50"
                    >
                      {t(loadingMore ? "loading" : moreError ? "more.error" : "more")}
                    </button>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <SearchX size={34} className="text-ink-3 mx-auto" aria-hidden="true" />
                  <p className="text-ink-3 mt-3 text-sm">{t("empty")}</p>
                </div>
              )}
            </div>
          )}

          {!hasSearched && history.length === 0 && (
            <div className="py-20 text-center">
              <Search size={34} className="text-ink-3 mx-auto" aria-hidden="true" />
              <p className="text-ink-3 mt-3 text-sm">{t("hint")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
