import React, { useMemo } from "react";
import classNames from "classnames";
import { Loader2, RefreshCcw } from "lucide-react";
import type { Descendant } from "slate";

import type { Flashcard, FlashcardDeck } from "@/types";

export interface FlashcardReviewDeckSummary {
  deckId: number;
  deckName: string;
  cards: Flashcard[];
}

export interface FlashcardReviewDeckListProps {
  reviewQueue: Flashcard[];
  decks: FlashcardDeck[];
  loading?: boolean;
  maxDecks?: number;
  onRefresh?: () => void | Promise<void>;
  onStartDeckReview: (deckId: number) => void | Promise<void>;
  className?: string;
  variant?: "workbench" | "home";
}

export const slateToPlainText = (nodes?: Descendant[] | null): string => {
  if (!nodes) return "";
  const read = (
    node: Descendant | { text?: unknown; children?: unknown },
  ): string => {
    if ("text" in node && typeof node.text === "string") return node.text;
    if ("children" in node && Array.isArray(node.children)) {
      return node.children.map((child) => read(child as Descendant)).join("");
    }
    return "";
  };
  return nodes
    .map((node) => read(node))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

export const buildFlashcardReviewDeckSummaries = (
  reviewQueue: Flashcard[],
  decks: FlashcardDeck[],
): FlashcardReviewDeckSummary[] => {
  const deckNameMap = new Map(decks.map((deck) => [deck.id, deck.name]));
  const grouped = new Map<number, FlashcardReviewDeckSummary>();

  reviewQueue.forEach((card) => {
    const current = grouped.get(card.deckId);
    if (current) {
      current.cards.push(card);
      return;
    }
    grouped.set(card.deckId, {
      deckId: card.deckId,
      deckName: deckNameMap.get(card.deckId) ?? `卡组 #${card.deckId}`,
      cards: [card],
    });
  });

  return Array.from(grouped.values()).sort(
    (left, right) => right.cards.length - left.cards.length,
  );
};

const containerClassByVariant = {
  workbench:
    "rounded-xl border border-slate-900/10 bg-white/70 p-3 dark:border-white/10 dark:bg-zinc-950/35",
  home: "min-h-0 flex-1 overflow-hidden",
};

const itemClassByVariant = {
  workbench: "rounded-lg bg-slate-900/4 px-2 py-1.5 dark:bg-white/6",
  home: "rounded-lg px-2 py-2 transition-colors hover:bg-slate-900/5 dark:hover:bg-white/10",
};

const FlashcardReviewDeckList: React.FC<FlashcardReviewDeckListProps> = ({
  reviewQueue,
  decks,
  loading = false,
  maxDecks = 4,
  onRefresh,
  onStartDeckReview,
  className,
  variant = "workbench",
}) => {
  const summaries = useMemo(
    () => buildFlashcardReviewDeckSummaries(reviewQueue, decks),
    [decks, reviewQueue],
  );
  const visibleSummaries = summaries.slice(0, maxDecks);

  return (
    <div className={classNames(containerClassByVariant[variant], className)}>
      <div className="space-y-3">
        <div>
          {visibleSummaries.length === 0 ? (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                暂无待复习
              </div>
              {onRefresh && (
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 cursor-pointer dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
                  onClick={() => void onRefresh()}
                  disabled={loading}
                  aria-label="刷新闪卡复习队列"
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCcw size={14} />
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {visibleSummaries.map((deck) => {
                const firstCardText =
                  slateToPlainText(deck.cards[0]?.prompt) ||
                  `#${deck.cards[0]?.id}`;
                return (
                  <div
                    key={deck.deckId}
                    className={classNames(
                      "flex min-w-0 items-center justify-between gap-2",
                      itemClassByVariant[variant],
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                        {deck.deckName}
                      </div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {firstCardText}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-md bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                        {deck.cards.length}
                      </span>
                      <button
                        type="button"
                        className="h-6 rounded-md bg-teal-600 px-2 text-[11px] font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50 cursor-pointer"
                        disabled={loading}
                        onClick={() => void onStartDeckReview(deck.deckId)}
                      >
                        复习
                      </button>
                    </div>
                  </div>
                );
              })}
              {summaries.length > maxDecks && (
                <div className="px-2 text-[10px] text-slate-500 dark:text-slate-400">
                  还有 {summaries.length - maxDecks} 个卡组
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlashcardReviewDeckList;
