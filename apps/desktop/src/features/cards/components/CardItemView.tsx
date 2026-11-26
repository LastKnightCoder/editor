/**
 * 卡片墙条目卡（等高网格卡）。
 *
 * 结构 = 正文快照摘要（前 3 块静态渲染，限高截断）+ 标签行贴底
 * （同行等高由行容器 stretch 保证）。hover 平铺
 * 「详情 / 更多」；更多菜单走域内共享的 CardActionMenu（与预览 ⋯ 菜单同源）。
 */

import { useCardsI18n } from "../i18n";
import { Maximize2, MoreHorizontal, Pin } from "lucide-react";
import type { ICard } from "@/types";
import { ContentPreview } from "@/components/ContentPreview";
import { FadeWhenOverflow } from "./FadeWhenOverflow";
import { IconButton, cn, Tag } from "@tau/ui";
import { CardActionMenu } from "./CardActionMenu";
import type { CardItemActions } from "../types";
import { cardDate } from "../format";
import { cardMorphKey } from "../morph";

export interface CardItemViewProps {
  card: ICard;
  actions: CardItemActions;
  /** 正文预览限高（px），由墙的列数分档决定（列少放宽、列多收紧） */
  previewMaxHeight?: number;
}

export function CardItemView({ card, actions, previewMaxHeight = 150 }: CardItemViewProps) {
  const { t, locale } = useCardsI18n();
  return (
    <article
      tabIndex={0}
      data-morph-key={cardMorphKey(card.id)}
      onPointerEnter={() => actions.onPrefetch?.(card)}
      onClick={() => actions.onOpen(card)}
      className={cn(
        "bg-surface border-line-1 ease-tau-out group flex cursor-pointer flex-col gap-2 rounded-[var(--tau-radius-md)] border p-[13px] pb-[11px]",
        // 落在卡片库那张纸上：细描边分隔，hover 只加深描边、不加阴影
        "hover:border-line-2 transition-[border-color] duration-200"
      )}
      style={card.isTop ? { borderColor: "var(--tau-accent)" } : undefined}
    >
      <div className="flex items-center gap-1.5 text-[11px]">
        {card.isTop && (
          <Pin
            className="text-accent size-3 shrink-0"
            strokeWidth={1.75}
            aria-label={t("pinned")}
          />
        )}
        <span className="flex-1" />
        <div
          className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
          onClick={e => e.stopPropagation()}
        >
          <IconButton
            title={t("action.detail")}
            className="size-[22px] rounded-[7px]"
            onClick={() => actions.onOpenDetail(card)}
          >
            <Maximize2 className="size-[13px]" strokeWidth={1.75} />
          </IconButton>
          <CardActionMenu
            card={card}
            actions={actions}
            trigger={
              <IconButton title={t("action.more")} className="size-[22px] rounded-[7px]">
                <MoreHorizontal className="size-[13px]" strokeWidth={1.75} />
              </IconButton>
            }
          />
        </div>
      </div>

      {/* 正文预览保留格式，限高避免长内容撑开卡片；溢出时底部一行渐隐替代硬切 */}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <FadeWhenOverflow style={{ maxHeight: previewMaxHeight }}>
          <ContentPreview content={card.content} />
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
          {card.linkCount > 0 && (
            <span className="text-info">
              {t("meta.links", {
                count: card.linkCount,
                amount: card.linkCount.toLocaleString(locale),
              })}
            </span>
          )}
          <span>
            {t("meta.words", { count: card.count, amount: card.count.toLocaleString(locale) })}
          </span>
          <span>{cardDate(card.create_time, locale, false)}</span>
        </span>
      </div>
    </article>
  );
}
