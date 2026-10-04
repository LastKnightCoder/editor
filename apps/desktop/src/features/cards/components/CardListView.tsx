/**
 * 卡片库列表视图：行式平铺，点列头排序（创建 / 更新 / 字数 / 链接，置顶始终在前）。
 *
 * 行 = 标题（AI 标题优先）+ 一行摘要 | 标签 | 链接 | 字数 | 更新 | 创建 | 悬停操作（详情 + ⋯）；
 * 点行打开预览弹窗，与卡片墙同一组操作。行高固定，@tanstack/react-virtual 定高虚拟滚动；
 * 列头在滚动容器内吸顶（scrollMargin 让出列头高度）。
 */

import { useLayoutEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link2, Maximize2, MoreHorizontal, Star } from "lucide-react";
import type { ICard } from "@/types";
import { IconButton, cn, useEdgeFade } from "@tau/ui";
import { ListTags, SortHeader } from "@/features/shared/list/ListControls";
import { cockpitRelativeTime } from "@/features/shared/cockpit/text";
import { formatDate } from "@/features/shared/cockpit/model";
import { cardListText, sortCardList, type CardListSort } from "../listModel";
import { CardActionMenu } from "./CardActionMenu";
import type { CardItemActions } from "../types";

const ROW_HEIGHT = 56;
const HEAD_HEIGHT = 32;
const COLS =
  "grid grid-cols-[minmax(240px,1fr)_minmax(120px,200px)_52px_64px_80px_96px_56px] items-center gap-4";

export interface CardListViewProps {
  cards: ICard[];
  sort: CardListSort;
  onSortChange(sort: CardListSort): void;
  actions: CardItemActions;
  /** 变化时滚回顶部（标签筛选切换） */
  resetScrollKey?: string;
}

export function CardListView({
  cards,
  sort,
  onSortChange,
  actions,
  resetScrollKey,
}: CardListViewProps) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl, { top: false });
  const rows = useMemo(() => sortCardList(cards, sort), [cards, sort]);

  useLayoutEffect(() => {
    if (scrollEl) scrollEl.scrollTop = 0;
  }, [scrollEl, resetScrollKey, sort]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_HEIGHT,
    scrollMargin: HEAD_HEIGHT,
    overscan: 10,
    getItemKey: index => rows[index].id,
  });

  const head = (key: CardListSort, label: string, className?: string) => (
    <SortHeader
      label={label}
      active={sort === key}
      onSort={() => onSortChange(key)}
      className={className}
    />
  );

  return (
    <div
      ref={setScrollEl}
      className="edge-fade-scroll -mx-[18px] min-h-0 flex-1 overflow-y-auto px-[18px]"
    >
      <div
        className={cn(
          COLS,
          "bg-surface text-tau-sm text-ink-3 sticky top-0 z-[2] px-3 shadow-[0_1px_0_var(--tau-line-2)]"
        )}
        style={{ height: HEAD_HEIGHT }}
      >
        <span>内容</span>
        <span>标签</span>
        {head("links", "链接", "justify-self-end")}
        {head("words", "字数", "justify-self-end")}
        {head("updated", "更新")}
        {head("created", "创建")}
        <span />
      </div>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map(item => (
          <CardListRow
            key={item.key}
            card={rows[item.index]}
            actions={actions}
            offset={item.start - HEAD_HEIGHT}
          />
        ))}
      </div>
    </div>
  );
}

function CardListRow({
  card,
  actions,
  offset,
}: {
  card: ICard;
  actions: CardItemActions;
  offset: number;
}) {
  const { title, excerpt } = cardListText(card);
  const cell = "text-tau-sm text-ink-2 truncate tabular-nums";
  return (
    <div
      tabIndex={0}
      onClick={() => actions.onOpen(card)}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target === e.currentTarget) actions.onOpen(card);
      }}
      className={cn(
        COLS,
        "hover:bg-hover group absolute left-0 top-0 w-full cursor-pointer rounded-[var(--tau-radius-md)] px-3 outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
      )}
      style={{ height: ROW_HEIGHT, transform: `translateY(${offset}px)` }}
    >
      <div className="min-w-0">
        <p className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium">
          {card.isTop && (
            <Star
              className="text-accent fill-accent size-[13px] shrink-0"
              strokeWidth={1.75}
              aria-label="已置顶"
            />
          )}
          <span className="truncate">{title || `卡片 #${card.id}`}</span>
        </p>
        <p className="text-ink-3 truncate text-[11.5px]">{excerpt || (title ? "" : "空卡片")}</p>
      </div>
      <ListTags tags={card.tags} />
      <span className={cn(cell, "flex items-center justify-end gap-1")}>
        {card.links.length > 0 ? (
          <>
            <Link2 className="text-ink-3 size-3 shrink-0" strokeWidth={1.75} />
            {card.links.length}
          </>
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </span>
      <span className={cn(cell, "text-right")}>{card.count.toLocaleString("zh-CN")}</span>
      <span className={cell}>{cockpitRelativeTime(card.update_time)}</span>
      <span className={cell}>{formatDate(card.create_time)}</span>
      <div
        className="flex justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100"
        onClick={e => e.stopPropagation()}
      >
        <IconButton
          title="进入详情"
          className="size-[23px] rounded-[7px]"
          onClick={() => actions.onOpenDetail(card)}
        >
          <Maximize2 className="size-[13px]" strokeWidth={1.75} />
        </IconButton>
        <CardActionMenu
          card={card}
          actions={actions}
          trigger={
            <IconButton title="更多操作" className="size-[23px] rounded-[7px]">
              <MoreHorizontal className="size-[13px]" strokeWidth={1.75} />
            </IconButton>
          }
        />
      </div>
    </div>
  );
}
