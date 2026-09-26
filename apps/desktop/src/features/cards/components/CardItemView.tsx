/**
 * 卡片墙条目卡（等高网格卡）。
 *
 * 结构 = 分类徽标（四分类色，域内数据色，不进主题词表）+ 正文预览（tau Editor
 * 只读渲染前 3 个 block，限高截断保格式——同旧版 CardItem 口径）+ 标签行贴底
 * （同行等高由行容器 stretch 保证）。hover 平铺「详情 / 更多」；更多菜单走域内
 * 共享的 CardActionMenu（与预览 ⋯ 菜单同源）。
 */

import { Maximize2, MoreHorizontal, Pin } from "lucide-react";
import { ECardCategory, type ICard } from "@/types";
import { cardCategoryName } from "@/constants/card";
import { CardContentPreview } from "./CardContentPreview";
import { FadeWhenOverflow } from "./FadeWhenOverflow";
import { IconButton, cn, Tag } from "@tau/ui";
import { CATEGORY_COLORS } from "../categoryColors";
import { CardActionMenu } from "./CardActionMenu";
import type { CardItemActions } from "../types";

export function CategoryBadge({
  category,
  full = false,
}: {
  category: ECardCategory;
  full?: boolean;
}) {
  const color = CATEGORY_COLORS[category];
  return (
    <span
      className="inline-flex w-fit shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-[8px] py-px text-[10.5px] leading-[1.6]"
      style={{ background: color.soft, color: color.text }}
    >
      <span className="size-[5px] shrink-0 rounded-full" style={{ background: color.text }} />
      {full ? cardCategoryName[category] : cardCategoryName[category].slice(0, 2)}
    </span>
  );
}

export interface CardItemViewProps {
  card: ICard;
  actions: CardItemActions;
  /** 正文预览限高（px），由墙的列数分档决定（列少放宽、列多收紧） */
  previewMaxHeight?: number;
}

export function CardItemView({ card, actions, previewMaxHeight = 150 }: CardItemViewProps) {
  const isLiterature = card.category === ECardCategory.Literature;

  return (
    <article
      tabIndex={0}
      onClick={() => actions.onOpen(card)}
      className={cn(
        "bg-surface border-line-1 ease-tau-out group flex cursor-pointer flex-col gap-2 rounded-[var(--tau-radius-md)] border p-[13px] pb-[11px]",
        // 落在卡片库那张纸上：细描边分隔（同文章卡），hover = lift 轻抬阴影 + 描边隐去
        "hover:shadow-lift transition-[box-shadow,border-color] duration-200 hover:border-transparent"
      )}
      style={
        card.isTop ? { borderColor: CATEGORY_COLORS[ECardCategory.Temporary].text } : undefined
      }
    >
      <div className="flex items-center gap-1.5 text-[11px]">
        <CategoryBadge category={card.category} />
        {card.isTop && (
          <Pin
            className="size-3 shrink-0"
            strokeWidth={1.75}
            style={{ color: CATEGORY_COLORS[ECardCategory.Temporary].text }}
          />
        )}
        <span className="flex-1" />
        <div
          className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={e => e.stopPropagation()}
        >
          <IconButton
            title="进入详情"
            className="size-[22px] rounded-[7px]"
            onClick={() => actions.onOpenDetail(card)}
          >
            <Maximize2 className="size-[13px]" strokeWidth={1.75} />
          </IconButton>
          <CardActionMenu
            card={card}
            actions={actions}
            trigger={
              <IconButton title="更多操作" className="size-[22px] rounded-[7px]">
                <MoreHorizontal className="size-[13px]" strokeWidth={1.75} />
              </IconButton>
            }
          />
        </div>
      </div>

      {/* 正文预览保留格式，限高避免长内容撑开卡片；溢出时底部一行渐隐替代硬切 */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-hidden",
          isLiterature && "border-l-2 pl-[10px]"
        )}
        style={
          isLiterature
            ? { borderLeftColor: CATEGORY_COLORS[ECardCategory.Literature].soft }
            : undefined
        }
      >
        <FadeWhenOverflow style={{ maxHeight: previewMaxHeight }}>
          <CardContentPreview content={card.content} />
        </FadeWhenOverflow>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <div
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
          title={card.tags.join("、")}
        >
          {card.tags.slice(0, 2).map(tag => (
            <Tag key={tag}>{tag}</Tag>
          ))}
          {card.tags.length > 2 && <Tag title={card.tags.join("、")}>+{card.tags.length - 2}</Tag>}
        </div>
        <span className="text-ink-3 flex shrink-0 items-center gap-2 text-[10.5px] tabular-nums">
          {card.links.length > 0 && <span className="text-info">{card.links.length} 连接</span>}
          <span>{card.count} 字</span>
          <span>{formatMonthDay(card.create_time)}</span>
        </span>
      </div>
    </article>
  );
}

export function formatMonthDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
}
