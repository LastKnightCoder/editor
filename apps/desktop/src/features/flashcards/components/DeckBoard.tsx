/**
 * 左板 · 卡组视图：卡组头（图标 + 名称 + 描述 + 卡组菜单 + 复习本组）→ 状态分段 + 题型筛选 →
 * 按「待复习 / 今天稍后 / 未来 7 天 / 更晚 / 已暂停」分段的卡片行（sticky 段头，零横线）。
 * 行点击 = 编辑；右键 = 卡片菜单。
 */

import {
  flashcardsTranslator,
  flashcardsCount,
  flashcardsDisplayContext,
  useFlashcardsI18n,
} from "../i18n";
import type { Flashcard, FlashcardDeck, FlashcardType } from "@/types";
import { Button, ContextMenu, IconButton, Menu, Segmented, cn } from "@tau/ui";
import { Check, ChevronDown, MoreHorizontal, Play, Plus, SlidersHorizontal } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import {
  SECTION_MESSAGE,
  TYPE_MESSAGE,
  TYPE_ORDER,
  sectionOf,
  type CardSection,
  type DeckStats,
} from "../model";
import { answerSummary, promptSummary } from "../summaries";
import { TYPE_ICON } from "../typeIcons";
import { DeckMark, DueLabel, StatusDot, TypeChip } from "./FlashcardBits";

export type StatusFilter = "all" | "due" | "new" | "learning" | "review" | "suspended";

const SECTION_ORDER: CardSection[] = ["due", "today", "week", "later", "suspended"];

export function DeckBoard({
  deck,
  cards,
  stats,
  now,
  status,
  type,
  onStatusChange,
  onTypeChange,
  onStart,
  onAddCard,
  onOpenCard,
  deckMenu,
  renderCardMenu,
}: {
  deck: FlashcardDeck;
  cards: Flashcard[];
  stats: DeckStats;
  now: number;
  status: StatusFilter;
  type: FlashcardType | "all";
  onStatusChange(status: StatusFilter): void;
  onTypeChange(type: FlashcardType | "all"): void;
  onStart(): void;
  onAddCard(): void;
  onOpenCard(card: Flashcard): void;
  deckMenu: ReactNode;
  renderCardMenu(card: Flashcard): ReactNode;
}) {
  useFlashcardsI18n();
  const filtered = cards.filter(card => {
    if (type !== "all" && card.type !== type) return false;
    if (status === "all") return true;
    if (status === "due") return sectionOf(card, now) === "due";
    return card.status === status;
  });
  const sections = SECTION_ORDER.map(key => ({
    key,
    cards: filtered
      .filter(card => sectionOf(card, now) === key)
      .sort((a, b) =>
        key === "due"
          ? Number(a.status === "new") - Number(b.status === "new") || a.dueTime - b.dueTime
          : a.dueTime - b.dueTime
      ),
  })).filter(section => section.cards.length > 0);

  const segments: [StatusFilter, string, number][] = [
    ["all", flashcardsTranslator.t("ui.all"), stats.total],
    ["due", flashcardsTranslator.t("ui.due"), stats.due],
    ["new", flashcardsTranslator.t("ui.new"), stats.fresh],
    ["learning", flashcardsTranslator.t("ui.learning"), stats.learning],
    ["review", flashcardsTranslator.t("ui.review"), stats.review],
    ["suspended", flashcardsTranslator.t("ui.suspended"), stats.suspended],
  ];

  return (
    <div className="pr-4 pb-3 pl-[22px]">
      <div className="flex items-center gap-3.5 px-0.5 pt-2.5 pb-2.5">
        <DeckMark deck={deck} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em]">{deck.name}</h2>
          <p className="text-ink-2 truncate text-[12.5px]">
            {deck.description || flashcardsTranslator.t("ui.noDescription")}
          </p>
        </div>
        <Menu
          align="end"
          trigger={
            <IconButton
              aria-label={flashcardsTranslator.t("ui.deckActions")}
              title={flashcardsTranslator.t("ui.deckActions")}
            >
              <MoreHorizontal size={16} strokeWidth={1.75} />
            </IconButton>
          }
        >
          {deckMenu}
        </Menu>
        {stats.due > 0 && (
          <Button variant="primary" icon={Play} onClick={onStart}>
            {flashcardsTranslator.t("ui.review2")} {flashcardsCount("count.cards", stats.due)}
          </Button>
        )}
      </div>

      {/* 始终一行：容器窄于 620px 时分段收紧内距、题型筛选收成图标，不换行也不越界撑出横向滚动 */}
      <div className="@container/filters flex items-center gap-2 px-0.5 pt-1 pb-1.5">
        <Segmented
          size="sm"
          label={flashcardsTranslator.t("ui.status")}
          value={status}
          onValueChange={(v: StatusFilter) => onStatusChange(v)}
        >
          {segments.map(([key, label, count]) => (
            <Segmented.Item
              key={key}
              value={key}
              className="@max-[620px]/filters:px-2.5"
              label={
                <>
                  {label}
                  <span className="ml-1 tabular-nums opacity-60">{count}</span>
                </>
              }
            />
          ))}
        </Segmented>
        <Menu
          align="end"
          trigger={
            <Button
              size="sm"
              variant="ghost"
              icon={SlidersHorizontal}
              className={cn(
                "@max-[620px]/filters:px-1.5 ml-auto",
                type !== "all" && "text-accent-text"
              )}
              title={
                type === "all"
                  ? flashcardsTranslator.t("ui.allQuestionTypes")
                  : flashcardsTranslator.t(TYPE_MESSAGE[type])
              }
            >
              <span className="@max-[620px]/filters:hidden">
                {type === "all"
                  ? flashcardsTranslator.t("ui.allQuestionTypes")
                  : flashcardsTranslator.t(TYPE_MESSAGE[type])}
              </span>
              <ChevronDown size={14} strokeWidth={1.75} className="@max-[620px]/filters:hidden" />
            </Button>
          }
        >
          {/* 当前题型：强调色 + 行尾勾；选完即关 */}
          {(["all", ...TYPE_ORDER] as const).map(t => {
            const Icon = t === "all" ? null : TYPE_ICON[t];
            return (
              <Fragment key={t}>
                <Menu.Item
                  icon={Icon ? <Icon className="size-[15px]" strokeWidth={1.75} /> : undefined}
                  className={cn(type === t && "text-accent-text")}
                  onSelect={() => onTypeChange(t)}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {t === "all"
                        ? flashcardsTranslator.t("ui.allQuestionTypes")
                        : flashcardsTranslator.t(TYPE_MESSAGE[t])}
                    </span>
                    {type === t && <Check className="size-[15px] flex-none" strokeWidth={2} />}
                  </span>
                </Menu.Item>
                {t === "all" && <Menu.Separator />}
              </Fragment>
            );
          })}
        </Menu>
      </div>

      {cards.length === 0 ? (
        <div className="text-ink-3 flex flex-col items-center gap-2.5 py-12 text-[12.5px]">
          {flashcardsTranslator.t("ui.thisDeckHasNoFlashcardsYet")}
          <Button size="sm" variant="soft" icon={Plus} onClick={onAddCard}>
            {flashcardsTranslator.t("ui.addTheFirstCard")}
          </Button>
        </div>
      ) : sections.length === 0 ? (
        <div className="text-ink-3 py-12 text-center text-[12.5px]">
          {flashcardsTranslator.t("ui.noFlashcardsMatchTheseFilters")}
        </div>
      ) : (
        sections.map(section => (
          <section key={section.key} className="mt-1.5">
            <div className="bg-surface sticky top-0 z-[3] flex items-baseline gap-2.5 px-0.5 pt-3 pb-2">
              <span className="text-[14px] font-semibold">
                {flashcardsTranslator.t(SECTION_MESSAGE[section.key])}
              </span>
              <span className="text-ink-3 text-[11.5px] tabular-nums">{section.cards.length}</span>
            </div>
            {section.cards.map(card => (
              <ContextMenu key={card.id} content={renderCardMenu(card)}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenCard(card)}
                  onKeyDown={e => e.key === "Enter" && onOpenCard(card)}
                  className={cn(
                    "hover:bg-hover ease-tau-out grid cursor-pointer grid-cols-[58px_minmax(0,1fr)_minmax(0,0.55fr)_64px_78px] items-center gap-x-3.5 rounded-[10px] px-2.5 py-2 outline-none transition-colors duration-150 focus-visible:shadow-[var(--tau-focus-ring)]"
                  )}
                >
                  <TypeChip type={card.type} />
                  <span
                    className={cn(
                      "truncate text-[13px]",
                      card.status === "suspended" && "text-ink-3"
                    )}
                  >
                    {promptSummary(card, flashcardsDisplayContext())}
                  </span>
                  <span className="text-ink-3 truncate text-[12px]">
                    {answerSummary(card, flashcardsDisplayContext())}
                  </span>
                  <StatusDot status={card.status} />
                  <DueLabel card={card} now={now} />
                </div>
              </ContextMenu>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
