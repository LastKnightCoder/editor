/**
 * 卡组 pills（与待办项目 pills / 文章标签 pills 同构）：今日总览 + 各卡组（图标 + 待复习数），
 * 卡组多时横向滚动，右缘还有内容时渐隐。右键卡组 pill = 卡组菜单。
 */

import type { FlashcardDeck } from "@/types";
import { ContextMenu, cn } from "@tau/ui";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { DeckMark } from "./FlashcardBits";

export function DeckPills({
  decks,
  dueByDeck,
  totalDue,
  value,
  onChange,
  renderDeckMenu,
}: {
  decks: FlashcardDeck[];
  dueByDeck: Map<number, number>;
  totalDue: number;
  /** null = 今日总览 */
  value: number | null;
  onChange(deckId: number | null): void;
  renderDeckMenu(deck: FlashcardDeck): ReactNode;
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useLayoutEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const measure = () => setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [scrollEl, decks]);

  const fadeMask = canScrollRight
    ? {
        maskImage: "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
      }
    : undefined;

  return (
    <div className="flex h-9 flex-none items-center pb-1">
      {/* py-1：给 pill 的 shadow-card 留出不被横向滚动裁掉的空间 */}
      <div
        ref={setScrollEl}
        className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-1"
        style={fadeMask}
      >
        <Pill
          active={value === null}
          onClick={() => onChange(null)}
          label="今日总览"
          count={totalDue}
        />
        {decks.map(deck => (
          <ContextMenu key={deck.id} content={renderDeckMenu(deck)}>
            <Pill
              active={value === deck.id}
              onClick={() => onChange(deck.id)}
              label={deck.name}
              count={dueByDeck.get(deck.id) || null}
              icon={<DeckMark deck={deck} size="xs" className="-ml-1" />}
            />
          </ContextMenu>
        ))}
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick(): void;
  label: string;
  count: number | null;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ease-tau-out flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] outline-none transition-[background,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
        active
          ? "bg-selected text-accent-text font-medium"
          : "bg-surface shadow-card text-ink-2 hover:text-ink-1"
      )}
    >
      {icon}
      {label}
      {count != null && count > 0 && (
        <span className={cn("text-[10.5px] tabular-nums", active ? "opacity-75" : "text-ink-3")}>
          {count}
        </span>
      )}
    </button>
  );
}
