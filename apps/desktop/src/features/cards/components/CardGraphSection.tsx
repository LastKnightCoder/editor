/**
 * 图谱视图：既有 LinkGraph 整体复用（links ∪ 内联链接成边），仅容器换壳——
 * 画布直接铺满卡片库那张纸的剩余区域（不再套卡片框，圆角由纸裁切）。
 * 数据来源优先是主进程的离线知识地图（语义近邻 + 两层主题），取不到时退回链接图谱。
 */

import { useMemo } from "react";
import LinkGraph from "@/components/LinkGraph";
import { getInlineLinks } from "@/utils/card";
import { useKnowledgeMap } from "../queries";
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
  const knowledgeMap = useKnowledgeMap(true);
  const getCardLinks = useMemo(
    () => (card: ICard) => [...new Set([...getInlineLinks(card), ...card.links])],
    []
  );
  return (
    <div className="border-line-2 min-h-0 min-w-0 flex-1 overflow-hidden border-t">
      {knowledgeMap.isPending && knowledgeMap.isFetching ? null : (
        <LinkGraph
          className="h-full w-full"
          initCards={cards}
          getCardLinks={getCardLinks}
          onClickCard={onOpenCard}
          enableHoverPreview={enableHoverPreview}
          currentCardIds={highlightIds}
          // 全库图谱是用户反复回看的那张「地图」：优先用主进程离线算好的知识地图；
          // 取不到时退回链接图谱，其布局坐标照旧跨重启保持
          persistKey="cards-library"
          knowledgeMap={knowledgeMap.data ?? null}
        />
      )}
    </div>
  );
}
