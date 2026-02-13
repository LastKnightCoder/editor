import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounceFn, useMemoizedFn } from "ahooks";
import { Link2, Search, SearchX } from "lucide-react";

import { PanContainer } from "../../../components/PanContainer";
import * as tauri from "../../../services/tauri";
import type { CardListItem } from "../../../types";

const DEFAULT_PAGE_SIZE = 20;

export type ContentLinkPickerResult = {
  contentId: number;
  contentType: string;
  contentTitle: string;
  refId: number;
  displayText: string;
};

type ContentLinkPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (result: ContentLinkPickerResult) => void;
};

function resolveDisplayText(item: CardListItem): string {
  const firstLine = item.excerpt?.split("\n")[0]?.trim();
  if (firstLine) {
    return firstLine;
  }
  return `内容 #${item.id}`;
}

export function ContentLinkPickerSheet(props: ContentLinkPickerSheetProps) {
  const { open, onClose, onSelect } = props;

  const [panelState, setPanelState] = useState<"normal" | "full">("normal");
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<CardListItem[]>([]);

  const requestSeqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const runSearch = useMemoizedFn(async (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setIsSearching(false);
      setResults([]);
      return;
    }
    const requestSeq = ++requestSeqRef.current;
    setIsSearching(true);
    try {
      const response = await tauri.getCardsOverview({
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        query: trimmed,
        category: "",
      });
      if (requestSeqRef.current !== requestSeq) {
        return;
      }
      setResults(response.items ?? []);
    } catch {
      if (requestSeqRef.current !== requestSeq) {
        return;
      }
      setResults([]);
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setIsSearching(false);
      }
    }
  });

  const { run: runDebouncedSearch, cancel: cancelDebouncedSearch } =
    useDebounceFn(
      (keyword: string) => {
        void runSearch(keyword);
      },
      {
        wait: 300,
      },
    );

  useEffect(() => {
    if (!open) {
      cancelDebouncedSearch();
      setPanelState("normal");
      setQuery("");
      setResults([]);
      setIsSearching(false);
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [cancelDebouncedSearch, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    runDebouncedSearch(query);
  }, [open, query, runDebouncedSearch]);

  const hasQuery = query.trim().length > 0;
  const hasResults = results.length > 0;

  const emptyHint = useMemo(() => {
    if (!hasQuery) {
      return "输入关键词搜索关联内容";
    }
    if (isSearching) {
      return "搜索中...";
    }
    return "未找到相关内容";
  }, [hasQuery, isSearching]);

  return (
    <PanContainer
      open={open}
      initialState={panelState}
      enabledStates={["normal", "full"]}
      heights={{ normal: 0.62 }}
      onRequestClose={onClose}
      onStateChange={(nextState) => {
        if (nextState === "normal" || nextState === "full") {
          setPanelState(nextState);
        }
      }}
      scrollRef={scrollRef}
      className="z-[10060]"
      containerClassName="bg-white dark:bg-neutral-950"
    >
      {(timeline) => (
        <>
          <div
            className="flex justify-center py-3"
            style={{ opacity: 1 - timeline.segmentProgress.normalToFull }}
          >
            <div className="h-1 w-10 rounded-full bg-gray-300 dark:bg-neutral-600" />
          </div>

          <header
            className={`px-4 ${
              timeline.state === "full" ? "mobile-safe-top-gap pb-3" : "pb-2"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Search size={16} aria-hidden="true" />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索关联内容"
                  className="input-base w-full rounded-lg py-2.5 pl-9 pr-3 text-[15px] text-gray-900 placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 text-[15px] text-gray-600 dark:text-neutral-300"
              >
                取消
              </button>
            </div>
          </header>

          <div
            ref={scrollRef}
            className="mobile-kb-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-2"
          >
            {hasResults ? (
              <div className="space-y-2">
                {results.map((item) => {
                  const displayText = resolveDisplayText(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-xl bg-white px-4 py-3 text-left transition-colors active:bg-gray-50 dark:bg-neutral-900 dark:active:bg-neutral-800"
                      onClick={() => {
                        onSelect({
                          contentId: item.id,
                          contentType: "card",
                          contentTitle: displayText,
                          refId: item.id,
                          displayText,
                        });
                      }}
                    >
                      <p className="line-clamp-1 text-[15px] font-medium text-gray-900 dark:text-gray-100">
                        {displayText}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                        <span>Card #{item.id}</span>
                        {item.category ? (
                          <>
                            <span>·</span>
                            <span>{item.category}</span>
                          </>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-14 text-center">
                {isSearching ? (
                  <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-gray-400 border-t-transparent dark:border-neutral-500" />
                ) : hasQuery ? (
                  <SearchX
                    size={30}
                    className="mx-auto text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                  />
                ) : (
                  <Link2
                    size={30}
                    className="mx-auto text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                  />
                )}
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                  {emptyHint}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </PanContainer>
  );
}

export default ContentLinkPickerSheet;
