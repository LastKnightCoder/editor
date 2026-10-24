import { useState, useRef, useEffect } from "react";
import { Search, SearchX, Trash2 } from "lucide-react";
import { useSearchHistory } from "../../hooks/useSearchHistory";
import { useEdgeFade } from "../../hooks/useScrollState";
import type { UnifiedSearchResponse, UnifiedSearchResult } from "../../types";
import { SearchField } from "../../components/SearchField";

type SearchPageProps = {
  onClose: () => void;
  onSearch: (query: string) => Promise<UnifiedSearchResponse>;
  onOpenResult: (result: UnifiedSearchResult) => void;
  isSearching: boolean;
};

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

const RESULT_TYPE_LABEL: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  "diary-daily": "日记",
  flashcard: "闪卡",
};

function SearchResultItem({ item, onClick }: { item: UnifiedSearchResult; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card w-full p-4 text-left transition-transform duration-200 active:scale-[0.97]"
    >
      <div className="flex items-center gap-2">
        <span className="bg-accent-soft text-accent inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold">
          {RESULT_TYPE_LABEL[item.type] ?? item.type}
        </span>
        {item.containerTitle && item.type !== "diary-daily" ? (
          <span className="text-ink-3 max-w-[45%] truncate text-[11.5px]">
            {item.containerTitle}
          </span>
        ) : null}
        {item.updateTime && (
          <span className="text-ink-3 ml-auto text-[11.5px]">{relativeTime(item.updateTime)}</span>
        )}
      </div>
      <p className="text-ink-1 mt-2 line-clamp-1 text-[14px] font-bold">
        {item.title || item.excerpt || `${RESULT_TYPE_LABEL[item.type] ?? "内容"} #${item.id}`}
      </p>
      {item.excerpt && (
        <p className="text-ink-2 mt-1 line-clamp-2 text-[12.5px] leading-relaxed">{item.excerpt}</p>
      )}
    </button>
  );
}

export function SearchPage({ onClose, onSearch, onOpenResult, isSearching }: SearchPageProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedSearchResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // 请求序号：快速连续搜索时只保留最后一次的结果，防止乱序覆盖
  const searchSeqRef = useRef(0);
  const { history, addHistory, clearHistory } = useSearchHistory();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const seq = ++searchSeqRef.current;
    setHasSearched(true);
    addHistory(trimmed);
    const searchResults = await onSearch(trimmed);
    if (seq !== searchSeqRef.current) return;
    setResults(searchResults);
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
          placeholder="搜索所有内容"
          className="flex-1"
        />
        <button
          type="button"
          onClick={onClose}
          className="text-ink-2 active:text-ink-1 shrink-0 text-[14px] font-semibold"
        >
          取消
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
                <h3 className="text-ink-1 text-[14px] font-extrabold">搜索历史</h3>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-ink-3 active:text-ink-1 p-1 transition-colors"
                  aria-label="清空历史"
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
              {isSearching ? (
                <div className="py-12 text-center">
                  <div className="border-accent mx-auto h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" />
                  <p className="text-ink-3 mt-3 text-sm">搜索中...</p>
                </div>
              ) : results?.items.length ? (
                <div className="space-y-3">
                  <p className="text-ink-3 px-1 text-[12.5px] font-semibold">
                    共 {results.total} 条结果
                  </p>
                  {results.items.map(item => (
                    <SearchResultItem
                      key={`${item.type}:${item.id}`}
                      item={item}
                      onClick={() => onOpenResult(item)}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <SearchX size={34} className="text-ink-3 mx-auto" aria-hidden="true" />
                  <p className="text-ink-3 mt-3 text-sm">未找到相关内容</p>
                </div>
              )}
            </div>
          )}

          {!hasSearched && history.length === 0 && (
            <div className="py-20 text-center">
              <Search size={34} className="text-ink-3 mx-auto" aria-hidden="true" />
              <p className="text-ink-3 mt-3 text-sm">输入关键词搜索内容</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchPage;
