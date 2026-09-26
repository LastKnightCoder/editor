/**
 * 图谱视图：既有 LinkGraph 整体复用（links ∪ 内联链接成边），仅容器换壳——
 * 画布直接铺满卡片库那张纸的剩余区域（不再套卡片框，圆角由纸裁切）。
 * LinkGraph 主题化改造（去 antd）属后续工作，本页先保能力。
 */

import { useMemo } from "react";
import LinkGraph from "@/components/LinkGraph";
import { getInlineLinks } from "@/utils/card";
import type { ICard } from "@/types";

export function CardGraphSection({
  cards,
  highlightIds,
  onOpenCard,
  enableHoverPreview,
}: {
  cards: ICard[];
  /** 当前筛选命中的卡片 id（未命中节点降淡，同旧版 currentCardIds） */
  highlightIds: number[];
  onOpenCard(card: ICard): void;
  enableHoverPreview: boolean;
}) {
  const getCardLinks = useMemo(
    () => (card: ICard) => [...new Set([...getInlineLinks(card), ...card.links])],
    []
  );
  return (
    <div className="border-line-2 min-h-0 min-w-0 flex-1 overflow-hidden border-t">
      <LinkGraph
        className="h-full w-full"
        initCards={cards}
        getCardLinks={getCardLinks}
        onClickCard={onOpenCard}
        enableHoverPreview={enableHoverPreview}
        currentCardIds={highlightIds}
      />
    </div>
  );
}
