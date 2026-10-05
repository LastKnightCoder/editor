/**
 * 卡片墙：置顶双列横卡 + 时间分组（今天/昨天/本周/本月/更早），组内等高网格
 * （同行 stretch 拉齐）。
 *
 * 虚拟化 = 行级 @tanstack/react-virtual（按行切分，非整卡虚拟）：行序列
 * [置顶头 / 置顶行×n / 组头 / 卡片行×n]…，行高动态 measure。列数由
 * ResizeObserver 观察滚动容器宽派生（仅用于数据切行，布局仍是 CSS grid）。
 * 分组头暂不吸顶（虚拟行内 sticky 不可靠）。
 */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, Pin } from "lucide-react";
import type { ICard } from "@/types";
import { CardContentPreview } from "./CardContentPreview";
import { cn, useEdgeFade, IconButton, Tag } from "@tau/ui";
import { bucketByTimeGroups } from "../queries";
import { CardItemView, formatMonthDay } from "./CardItemView";
import { FadeWhenOverflow } from "./FadeWhenOverflow";
import { useScrollTopOnChange } from "@/hooks/useScrollTopOnChange";
import type { CardItemActions } from "../types";
import { cardMorphKey } from "../morph";

const MIN_CARD_WIDTH = 288;
const GAP = 16;
const FEATURED_COLS = 2;
const HEAD_HEIGHT = 44;
const FEATURED_ESTIMATE = 150;
const CARD_ESTIMATE = 170;

type WallRow =
  | { kind: "pin-head"; count: number }
  | { kind: "featured"; cards: ICard[] }
  | { kind: "group-head"; label: string; count: number }
  | { kind: "cards"; cards: ICard[] };

export interface CardWallListProps {
  cards: ICard[];
  actions: CardItemActions;
  resetScrollKey?: string;
}

export function CardWallList({ cards, actions, resetScrollKey }: CardWallListProps) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(3);
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEdgeFade(scrollEl);

  useScrollTopOnChange(scrollEl, resetScrollKey, () => setShowBackToTop(false));

  /* 列数跟随滚动容器宽（侧栏收起/拖宽/窗口缩放统一覆盖；rAF 合并） */
  const widthRef = useRef(0);
  useLayoutEffect(() => {
    const el = scrollEl;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const style = getComputedStyle(el);
        const width =
          el.clientWidth -
          parseFloat(style.paddingLeft || "0") -
          parseFloat(style.paddingRight || "0");
        if (width === widthRef.current) return;
        widthRef.current = width;
        setCols(Math.max(1, Math.min(6, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)))));
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scrollEl]);

  /** 置顶列数跟随主列数：窄屏单列时置顶与普通卡同宽，层级靠左色脊 / 徽章保底 */
  const featuredCols = Math.min(FEATURED_COLS, cols);

  const rows = useMemo<WallRow[]>(() => {
    const list: WallRow[] = [];
    const tops = cards.filter(card => card.isTop);
    if (tops.length > 0) {
      list.push({ kind: "pin-head", count: tops.length });
      for (let i = 0; i < tops.length; i += featuredCols) {
        list.push({ kind: "featured", cards: tops.slice(i, i + featuredCols) });
      }
    }
    for (const group of bucketByTimeGroups(cards)) {
      list.push({ kind: "group-head", label: group.label, count: group.cards.length });
      for (let i = 0; i < group.cards.length; i += cols) {
        list.push({ kind: "cards", cards: group.cards.slice(i, i + cols) });
      }
    }
    return list;
  }, [cards, cols, featuredCols]);

  /** 预览限高分档：列少卡宽时放宽（减少宽扁卡下部留白），列多卡窄时收紧（防挤压） */
  const previewMaxH = cols <= 2 ? 200 : cols >= 4 ? 120 : 150;
  const featuredMaxH = cols <= 2 ? 180 : cols >= 4 ? 120 : 140;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: index => {
      const row = rows[index];
      if (row.kind === "pin-head" || row.kind === "group-head") return HEAD_HEIGHT;
      if (row.kind === "featured") return FEATURED_ESTIMATE;
      return CARD_ESTIMATE;
    },
    overscan: 6,
    getItemKey: index => {
      const row = rows[index];
      if (row.kind === "pin-head") return "pin-head";
      if (row.kind === "group-head") return `head-${row.label}`;
      const first = row.cards[0];
      return `${row.kind}-${first.id}`;
    },
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={setScrollEl}
        onScroll={event => setShowBackToTop(event.currentTarget.scrollTop > 100)}
        className="edge-fade-scroll -mx-[18px] min-h-0 flex-1 overflow-y-auto px-[18px]"
      >
        {rows.length === 0 ? null : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map(item => {
              const row = rows[item.index];
              return (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {row.kind === "pin-head" && (
                    <SectionHead first={item.index === 0} label="置顶" count={row.count} />
                  )}
                  {row.kind === "group-head" && (
                    <SectionHead first={item.index === 0} label={row.label} count={row.count} />
                  )}
                  {row.kind === "featured" && (
                    <div
                      className="grid gap-4 pb-4"
                      style={{
                        gridTemplateColumns: `repeat(${Math.min(featuredCols, row.cards.length)}, minmax(0, 1fr))`,
                      }}
                    >
                      {row.cards.map(card => (
                        <FeaturedCard
                          key={card.id}
                          card={card}
                          actions={actions}
                          previewMaxHeight={featuredMaxH}
                        />
                      ))}
                    </div>
                  )}
                  {row.kind === "cards" && (
                    <div
                      className="grid items-stretch gap-4 pb-4"
                      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                    >
                      {row.cards.map(card => (
                        <CardItemView
                          key={card.id}
                          card={card}
                          actions={actions}
                          previewMaxHeight={previewMaxH}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showBackToTop && (
        <IconButton
          title="回到顶部"
          className="bg-surface enabled:hover:bg-surface-hover shadow-float rounded-tau-md absolute bottom-5 right-3 size-9"
          onClick={() => {
            virtualizer.scrollToOffset(0);
            setShowBackToTop(false);
          }}
        >
          <ArrowUp className="size-4" strokeWidth={1.75} />
        </IconButton>
      )}
    </div>
  );
}

/** first = 墙内首个组头不压上边距；其余组头 pt-4 叠加上行 pb-4 构成 32px 组间距 */
function SectionHead({
  label,
  count,
  first = false,
}: {
  label: string;
  count: number;
  first?: boolean;
}) {
  return (
    <header className={cn("flex items-baseline gap-2 pb-2", first ? "pt-2" : "pt-4")}>
      <b className="text-ink-2 text-[13px] font-semibold">{label}</b>
      <span className="text-ink-3 text-[11px] tabular-nums">{count} 张</span>
      <span className="bg-sunken/60 ml-1 h-px flex-1 self-center" />
    </header>
  );
}

/** 置顶横卡：双列宽，左缘置顶色脊，正文 Editor 只读预览（同条目卡口径） */
function FeaturedCard({
  card,
  actions,
  previewMaxHeight,
}: {
  card: ICard;
  actions: CardItemActions;
  previewMaxHeight: number;
}) {
  return (
    <article
      tabIndex={0}
      data-morph-key={cardMorphKey(card.id)}
      onPointerEnter={() => actions.onPrefetch?.(card)}
      onClick={() => actions.onOpen(card)}
      className={cn(
        "bg-surface border-line-1 ease-tau-out group relative flex cursor-pointer overflow-hidden rounded-[var(--tau-radius-lg)] border py-4 pl-[18px] pr-5",
        "hover:shadow-lift transition-[box-shadow,border-color] duration-200 hover:border-transparent"
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: "var(--tau-accent)" }} />
      <span
        className="bg-accent-soft text-accent absolute right-3.5 top-3 grid size-[22px] place-items-center rounded-full"
        title="已置顶"
      >
        <Pin className="size-3" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <FadeWhenOverflow style={{ maxHeight: previewMaxHeight }}>
            <CardContentPreview content={card.content} />
          </FadeWhenOverflow>
        </div>
        <div className="text-ink-3 flex min-w-0 items-center gap-1.5 text-[11.5px] tabular-nums">
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
            title={card.tags.join("、")}
          >
            {card.tags.map(tag => (
              <Tag key={tag} title={tag} className="shrink-0">
                {tag}
              </Tag>
            ))}
          </div>
          <span className="flex shrink-0 items-center gap-2.5">
            {card.links.length > 0 && <span className="text-info">⇄ {card.links.length}</span>}
            <span>{card.count} 字</span>
            <span>{formatMonthDay(card.create_time)}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
