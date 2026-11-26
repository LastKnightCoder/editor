/**
 * 左板 · 今日总览：顶部今日块（待复习数 + 构成 + 预计耗时 + 开始复习，本屏唯一 primary）→
 * 卡组行（按待复习数排序；待复习 / 构成条 / 7 日到期柱，行尾常驻小号「复习」图标按钮）。
 */

import {
  flashcardsTranslator,
  flashcardsCount,
  flashcardsDisplayContext,
  useFlashcardsI18n,
} from "../i18n";
import { dueText } from "../format";
import type { Flashcard, FlashcardDeck } from "@/types";
import { Button, ContextMenu, IconButton, cn } from "@tau/ui";
import { Play, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { DAY_MS, estimateMinutes, type DeckStats } from "../model";
import { DeckMark, ForecastBars, MixBar } from "./FlashcardBits";

/* 名称列可收到 0（名称 / 描述自带截断）：窄窗下网格不越界撑出横向滚动 */
const ROW_COLS =
  "grid grid-cols-[28px_minmax(0,1fr)_110px_minmax(72px,120px)_58px_28px] items-center gap-x-4";

export function OverviewBoard({
  decks,
  stats,
  queue,
  cards,
  now,
  onStart,
  onOpenDeck,
  onAddCard,
  renderDeckMenu,
}: {
  decks: FlashcardDeck[];
  stats: Map<number, DeckStats>;
  queue: Flashcard[];
  cards: Flashcard[];
  now: number;
  onStart(deckId: number | null): void;
  onOpenDeck(deckId: number): void;
  onAddCard(deckId: number): void;
  renderDeckMenu(deck: FlashcardDeck): ReactNode;
}) {
  useFlashcardsI18n();
  const fresh = queue.filter(c => c.status === "new").length;
  const laterToday = [...stats.values()].reduce((sum, s) => sum + s.laterToday, 0);
  const sorted = [...decks].sort(
    (a, b) => (stats.get(b.id)?.due ?? 0) - (stats.get(a.id)?.due ?? 0)
  );
  const nextDay = cards.filter(
    c => c.status !== "suspended" && c.dueTime > now && c.dueTime - now < DAY_MS
  ).length;

  return (
    <div className="pr-4 pb-3 pl-[22px]">
      <div className="flex items-center gap-[18px] px-0.5 pt-3 pb-5">
        <div className="min-w-0 flex-1">
          {queue.length > 0 ? (
            <>
              <div className="text-[21px] font-semibold tracking-[-0.01em]">
                {flashcardsCount("count.due", queue.length)}
              </div>
              <div className="text-ink-2 mt-0.5 text-[12.5px] tabular-nums">
                {flashcardsTranslator.t("ui.due2")}
                {queue.length - fresh}
                <Sep />
                {flashcardsTranslator.t("ui.new")}
                {fresh}
                <Sep />
                {flashcardsCount("overview.estimate", estimateMinutes(queue))}
                {laterToday > 0 && (
                  <>
                    <Sep />
                    {flashcardsCount("overview.later", laterToday)}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-[21px] font-semibold tracking-[-0.01em]">
                {cards.length
                  ? flashcardsTranslator.t("ui.todaysReviewIsComplete")
                  : flashcardsTranslator.t("ui.noFlashcardsYet")}
              </div>
              <div className="text-ink-2 mt-0.5 text-[12.5px]">
                {cards.length
                  ? laterToday
                    ? flashcardsCount("overview.laterDue", laterToday)
                    : flashcardsCount("overview.nextDay", nextDay)
                  : flashcardsTranslator.t("ui.createADeckAndAddAFlashcardOrGenerateFrom")}
              </div>
            </>
          )}
        </div>
        {queue.length > 0 && (
          <Button variant="primary" icon={Play} onClick={() => onStart(null)}>
            {flashcardsTranslator.t("ui.startReview")}
          </Button>
        )}
      </div>

      {decks.length > 0 && (
        <section>
          <div className="bg-surface sticky top-0 z-[3] flex items-baseline gap-2.5 px-0.5 pt-3 pb-2">
            <span className="text-[14px] font-semibold">{flashcardsTranslator.t("ui.deck")}</span>
            <span className="text-ink-3 text-[11.5px] tabular-nums">
              {flashcardsTranslator.t("deck.groupStats", {
                decks: decks.length,
                cards: cards.length,
              })}
            </span>
            <span className="text-ink-3 ml-auto text-[11.5px]">
              {flashcardsTranslator.t("ui.sortedByDueCards")}
            </span>
          </div>
          <div className={cn(ROW_COLS, "text-ink-3 px-2.5 pb-1 text-[11px]")}>
            <span />
            <span>{flashcardsTranslator.t("ui.name")}</span>
            <span>{flashcardsTranslator.t("ui.due")}</span>
            <span>{flashcardsTranslator.t("ui.newLearningReview")}</span>
            <span>{flashcardsTranslator.t("ui.dueIn7Days")}</span>
            <span />
          </div>
          {sorted.map(deck => {
            const s = stats.get(deck.id);
            if (!s) return null;
            return (
              <ContextMenu key={deck.id} content={renderDeckMenu(deck)}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenDeck(deck.id)}
                  onKeyDown={e => e.key === "Enter" && onOpenDeck(deck.id)}
                  className={cn(
                    ROW_COLS,
                    "hover:bg-hover ease-tau-out group relative cursor-pointer rounded-[12px] px-2.5 py-[9px] outline-none transition-colors duration-150 focus-visible:shadow-[var(--tau-focus-ring)]"
                  )}
                >
                  <DeckMark deck={deck} />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium">{deck.name}</div>
                    <div className="text-ink-3 truncate text-[11.5px]">
                      {deck.description || flashcardsCount("count.cards", s.total)}
                    </div>
                  </div>
                  <DeckDueCell
                    stats={s}
                    deckCards={cards.filter(c => c.deckId === deck.id)}
                    now={now}
                  />
                  {s.total ? <MixBar stats={s} /> : <span />}
                  {s.total ? <ForecastBars values={s.forecast} /> : <span />}
                  {s.due > 0 || s.total === 0 ? (
                    <IconButton
                      aria-label={
                        s.due
                          ? flashcardsTranslator.t("ui.review2")
                          : flashcardsTranslator.t("ui.addCard")
                      }
                      title={
                        s.due
                          ? flashcardsTranslator.t("ui.review2")
                          : flashcardsTranslator.t("ui.addCard")
                      }
                      className="text-accent enabled:hover:bg-accent-soft enabled:hover:text-accent size-7 rounded-full [&_svg]:size-3.5"
                      onClick={e => {
                        e.stopPropagation();
                        if (s.due) onStart(deck.id);
                        else onAddCard(deck.id);
                      }}
                    >
                      {s.due ? (
                        <Play fill="currentColor" strokeWidth={0} />
                      ) : (
                        <Plus strokeWidth={2} />
                      )}
                    </IconButton>
                  ) : (
                    <span />
                  )}
                </div>
              </ContextMenu>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Sep() {
  useFlashcardsI18n();
  return <span className="text-ink-3 mx-1.5">·</span>;
}

function DeckDueCell({
  stats,
  deckCards,
  now,
}: {
  stats: DeckStats;
  deckCards: Flashcard[];
  now: number;
}) {
  useFlashcardsI18n();
  if (!stats.total)
    return (
      <span className="text-ink-3 text-[12px]">{flashcardsTranslator.t("ui.noCardsYet")}</span>
    );
  if (!stats.due) {
    const next = deckCards
      .filter(c => c.status !== "suspended")
      .sort((a, b) => a.dueTime - b.dueTime)[0];
    return (
      <span className="text-ink-3 text-[12px] whitespace-nowrap">
        {next
          ? flashcardsTranslator.t("overview.next", {
              due: dueText(next, now, flashcardsDisplayContext()).text,
            })
          : flashcardsTranslator.t("ui.allSuspended")}
      </span>
    );
  }
  const fresh = deckCards.filter(c => c.status === "new").length;
  const old = stats.due - fresh;
  const parts: [number, string][] = [];
  if (old > 0) parts.push([old, flashcardsTranslator.t("ui.due2")]);
  if (fresh > 0) parts.push([fresh, flashcardsTranslator.t("ui.new2")]);
  return (
    <span className="text-ink-2 text-[12.5px] whitespace-nowrap">
      {parts.map(([n, label], i) => (
        <span key={label}>
          {i > 0 && " · "}
          <b className="text-ink-1 font-semibold tabular-nums">{n}</b> {label}
        </span>
      ))}
    </span>
  );
}
