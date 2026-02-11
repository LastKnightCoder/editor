import { useState, useRef, useEffect } from "react";
import { useSearchHistory } from "../../hooks/useSearchHistory";
import type { CardsOverviewResponse, CardListItem } from "../../types";

type SearchPageProps = {
  onClose: () => void;
  onSearch: (query: string) => Promise<CardsOverviewResponse>;
  onPreviewCard: (cardId: number) => void;
  isSearching: boolean;
};

function IconSearch() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function relativeTime(ts: number): string {
  if (!ts) return "";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const diff = Date.now() - normalized;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(normalized).toLocaleDateString();
}

function SearchResultItem({
  item,
  onClick,
}: {
  item: CardListItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl bg-white p-4 text-left transition-colors active:bg-gray-50 dark:bg-gray-800 dark:active:bg-gray-700"
    >
      <p className="line-clamp-1 text-[15px] font-medium text-gray-900 dark:text-gray-100">
        {item.excerpt?.split("\n")[0] || `卡片 #${item.id}`}
      </p>
      {item.excerpt && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
          {item.excerpt}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        {item.category && <span>{item.category}</span>}
        {item.updateTime && (
          <>
            <span>·</span>
            <span>{relativeTime(item.updateTime)}</span>
          </>
        )}
      </div>
      {item.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export function SearchPage({
  onClose,
  onSearch,
  onPreviewCard,
  isSearching,
}: SearchPageProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardsOverviewResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { history, addHistory, clearHistory } = useSearchHistory();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setHasSearched(true);
    addHistory(trimmed);
    const searchResults = await onSearch(trimmed);
    setResults(searchResults);
  };

  const handleHistoryClick = (historyQuery: string) => {
    setQuery(historyQuery);
    handleSearch(historyQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch(query);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 搜索栏 */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 pb-3 pt-safe dark:border-gray-800 dark:bg-gray-900">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <IconSearch />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索"
            className="input-base w-full rounded-lg py-2.5 pl-10 pr-4 text-[15px] text-gray-900 placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-[15px] text-blue-500 dark:text-blue-400"
        >
          取消
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {!hasSearched && history.length > 0 ? (
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                搜索历史
              </h3>
              <button
                type="button"
                onClick={clearHistory}
                className="p-1 text-gray-400 transition-colors active:text-gray-600 dark:text-gray-500 dark:active:text-gray-300"
                aria-label="清空历史"
              >
                <IconTrash />
              </button>
            </div>
            <div className="space-y-1">
              {history.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleHistoryClick(item)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors active:bg-gray-100 dark:active:bg-gray-800"
                >
                  <span className="text-gray-400">
                    <IconSearch />
                  </span>
                  <span className="flex-1 truncate text-[15px] text-gray-700 dark:text-gray-200">
                    {item}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {hasSearched && (
          <div className="p-4">
            {isSearching ? (
              <div className="py-12 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  搜索中...
                </p>
              </div>
            ) : results?.items.length ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  共 {results.total} 条结果
                </p>
                {results.items.map((item) => (
                  <SearchResultItem
                    key={item.id}
                    item={item}
                    onClick={() => onPreviewCard(item.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-4xl">🔍</p>
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  未找到相关内容
                </p>
              </div>
            )}
          </div>
        )}

        {!hasSearched && history.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-4xl">🔍</p>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              输入关键词搜索卡片
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchPage;
