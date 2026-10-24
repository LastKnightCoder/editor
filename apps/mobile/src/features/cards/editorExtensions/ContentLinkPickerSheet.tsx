import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounceFn, useMemoizedFn } from "ahooks";
import { Link2, SearchX } from "lucide-react";

import { SnapSheet } from "../../../components/SnapSheet";
import { SearchField } from "../../../components/SearchField";
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

export function mapCardItemToContentLinkResult(item: CardListItem): ContentLinkPickerResult {
  const displayText = resolveDisplayText(item);
  return {
    contentId: item.contentId,
    contentType: "card",
    contentTitle: displayText,
    refId: item.id,
    displayText,
  };
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

  const { run: runDebouncedSearch, cancel: cancelDebouncedSearch } = useDebounceFn(
    (keyword: string) => {
      void runSearch(keyword);
    },
    {
      wait: 300,
    }
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
    <SnapSheet
      open={open}
      state={panelState}
      states={["normal", "full"]}
      normalHeight={0.62}
      onClose={onClose}
      onStateChange={nextState => {
        if (nextState === "normal" || nextState === "full") {
          setPanelState(nextState);
        }
      }}
      scrollRef={scrollRef}
      className="z-10060"
      containerClassName=""
    >
      <>
        <SnapSheet.Handle />

        <header className={`px-4 ${panelState === "full" ? "mobile-safe-top-gap pb-3" : "pb-2"}`}>
          <div className="flex items-center gap-3">
            <SearchField
              inputRef={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="搜索关联内容"
              className="flex-1"
            />
            <button type="button" onClick={onClose} className="text-ink-2 shrink-0 text-[15px]">
              取消
            </button>
          </div>
        </header>

        <SnapSheet.Scroll ref={scrollRef} className="px-4 pt-2">
          {hasResults ? (
            <div className="space-y-2">
              {results.map(item => {
                const displayText = resolveDisplayText(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="bg-surface active:bg-hover w-full rounded-2xl rounded-xl px-4 py-3 text-left transition-colors"
                    onClick={() => {
                      onSelect(mapCardItemToContentLinkResult(item));
                    }}
                  >
                    <p className="text-ink-1 line-clamp-1 text-[15px] font-medium">{displayText}</p>
                    <div className="text-ink-3 mt-2 flex items-center gap-2 text-xs">
                      <span>Card #{item.id}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-14 text-center">
              {isSearching ? (
                <div className="border-accent mx-auto h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" />
              ) : hasQuery ? (
                <SearchX size={30} className="text-ink-3 mx-auto" aria-hidden="true" />
              ) : (
                <Link2 size={30} className="text-ink-3 mx-auto" aria-hidden="true" />
              )}
              <p className="text-ink-3 mt-3 text-sm">{emptyHint}</p>
            </div>
          )}
        </SnapSheet.Scroll>
      </>
    </SnapSheet>
  );
}

export default ContentLinkPickerSheet;
