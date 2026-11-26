// 添加关联弹层：搜索卡片 + 多选勾选 +「完成 · N」提交。
// 空关键词时展示最近卡片；勾选状态由父层在 onConfirm 统一写回（updateCardLinks）。

import { useMobileCardsI18n } from "./i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounceFn, useMemoizedFn } from "ahooks";
import { Check, Link2, Plus, SearchX } from "lucide-react";

import { SnapSheet } from "../../components/SnapSheet";
import { SearchField } from "../../components/SearchField";
import * as tauri from "../../services/tauri";
import type { CardListItem } from "../../types";
import { cardTimeDisplay } from "./format";

const PAGE_SIZE = 20;

type CardLinksSheetProps = {
  open: boolean;
  /** 排除自己，避免自关联 */
  selfCardId: number;
  selected: number[];
  onClose: () => void;
  onConfirm: (links: number[]) => void;
};

function resolveTitle(item: CardListItem, fallback: string): string {
  const firstLine = item.excerpt?.split("\n")[0]?.trim();
  return firstLine || fallback;
}

export function CardLinksSheet({
  open,
  selfCardId,
  selected,
  onClose,
  onConfirm,
}: CardLinksSheetProps) {
  const { t, locale } = useMobileCardsI18n();
  const [panelState, setPanelState] = useState<"normal" | "full">("normal");
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<CardListItem[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const requestSeqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 打开时以父层传入的已关联集合初始化勾选
  useEffect(() => {
    if (open) {
      setPicked(new Set(selected));
    }
  }, [open, selected]);

  const runSearch = useMemoizedFn(async (keyword: string) => {
    const trimmed = keyword.trim();
    const requestSeq = ++requestSeqRef.current;
    setIsSearching(true);
    try {
      const response = await tauri.getCardsOverview({
        page: 1,
        pageSize: PAGE_SIZE,
        query: trimmed,
      });
      if (requestSeqRef.current !== requestSeq) {
        return;
      }
      setResults((response.items ?? []).filter(item => item.id !== selfCardId));
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
    (keyword: string) => void runSearch(keyword),
    { wait: 300 }
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
    return () => window.cancelAnimationFrame(frame);
  }, [cancelDebouncedSearch, open]);

  useEffect(() => {
    if (open) {
      runDebouncedSearch(query);
    }
  }, [open, query, runDebouncedSearch]);

  const toggle = useMemoizedFn((cardId: number) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  });

  const hint = useMemo(() => {
    if (isSearching) {
      return t("links.searching");
    }
    if (query.trim()) {
      return t("links.empty");
    }
    return t("links.hint");
  }, [isSearching, query, t]);

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
          <div className="flex items-center gap-2.5">
            <span className="text-ink-1 text-[16px] font-bold">{t("links.title")}</span>
            <button
              type="button"
              onClick={() => onConfirm([...picked])}
              className="bg-accent-soft text-accent ml-auto rounded-full px-3.5 py-[7px] text-[13px] font-bold active:opacity-80"
            >
              {t("links.done", { amount: picked.size.toLocaleString(locale) })}
            </button>
          </div>
          <SearchField
            inputRef={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={t("search.placeholder")}
            className="mt-2.5"
          />
        </header>

        <SnapSheet.Scroll ref={scrollRef} className="px-4 pt-2">
          {results.length > 0 ? (
            <div className="space-y-2 pb-6">
              {results.map(item => {
                const isSelected = picked.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className="bg-surface shadow-card active:bg-hover flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-ink-1 line-clamp-1 text-[14.5px] font-semibold">
                        {resolveTitle(item, t("fallback", { id: item.id }))}
                      </p>
                      <p className="text-ink-3 mt-0.5 text-[11.5px]">
                        {cardTimeDisplay(item.updateTime, locale)}
                      </p>
                    </div>
                    <span
                      className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full ${
                        isSelected
                          ? "bg-accent text-ink-inverse"
                          : "border-line-1 text-ink-2 border-[1.5px]"
                      }`}
                      aria-hidden
                    >
                      {isSelected ? (
                        <Check size={14} strokeWidth={3} />
                      ) : (
                        <Plus size={14} strokeWidth={2.5} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-14 text-center">
              {isSearching ? (
                <div className="border-accent mx-auto h-7 w-7 animate-spin rounded-full border-2 border-t-transparent" />
              ) : query.trim() ? (
                <SearchX size={30} className="text-ink-3 mx-auto" aria-hidden />
              ) : (
                <Link2 size={30} className="text-ink-3 mx-auto" aria-hidden />
              )}
              <p className="text-ink-3 mt-3 text-sm">{hint}</p>
            </div>
          )}
        </SnapSheet.Scroll>
      </>
    </SnapSheet>
  );
}

export default CardLinksSheet;
