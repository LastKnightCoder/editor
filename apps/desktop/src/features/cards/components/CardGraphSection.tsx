/**
 * 图谱视图：既有 LinkGraph 整体复用（links ∪ 内联链接成边），仅容器换壳——
 * 画布直接铺满卡片库那张纸的剩余区域（不再套卡片框，圆角由纸裁切）。
 * 数据来源优先是主进程的离线知识地图（语义近邻 + 两层主题），取不到时退回链接图谱。
 *
 * 入场动画（卡片按创建时间一张张长出来）的时机也在这里决定，见 graphMilestones：
 * 这个库第一次进入图谱时自动播一次；之后卡片数跨过里程碑，左下角说明行换成邀请语，
 * 点了才播。平时说明行本身就是入口，工具栏里不放按钮。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import LinkGraph, { type LinkGraphPlaybackHandle } from "@/components/LinkGraph";
import useSettingStore from "@/stores/useSettingStore";
import { getInlineLinks } from "@/utils/card";
import { graphMoment, milestoneOf, useGraphMilestoneStore } from "../graphMilestones";
import { useKnowledgeMap } from "../queries";
import type { ICard } from "@/types";

/** 等图谱画出第一帧再自动播：刚挂载时画布尺寸与相机还没就绪 */
const AUTOPLAY_DELAY = 400;

export function CardGraphSection({
  cards,
  highlightIds,
  onOpenCard,
  enableHoverPreview,
}: {
  cards: ICard[];
  /** 当前筛选命中的卡片 id；null 表示没有筛选（「全部」）。命中的保持主题色，未命中的降淡 */
  highlightIds: number[] | null;
  onOpenCard(card: ICard): void;
  enableHoverPreview: boolean;
}) {
  const knowledgeMap = useKnowledgeMap(true);
  const getCardLinks = useMemo(
    () => (card: ICard) => [...new Set([...getInlineLinks(card), ...card.links])],
    []
  );
  const graphShown = !(knowledgeMap.isPending && knowledgeMap.isFetching);

  const databaseName = useSettingStore(state => state.setting.database.active);
  const seen = useGraphMilestoneStore(state => state.seenByDatabase[databaseName] ?? null);
  const markSeen = useGraphMilestoneStore(state => state.markSeen);
  const playbackRef = useRef<LinkGraphPlaybackHandle>(null);
  const [invite, setInvite] = useState<number | null>(null);
  const [autoplay, setAutoplay] = useState(false);

  // 每次进入图谱视图（挂载）只判定一次：卡片数在视图里变化（新建一张）不该突然弹邀请
  const decidedRef = useRef(false);
  useEffect(() => {
    if (decidedRef.current || !graphShown || cards.length === 0) return;
    decidedRef.current = true;
    const moment = graphMoment(cards.length, seen);
    if (moment.kind === "autoplay") {
      // 第一次进入：自动播一次。里程碑记到当前档，已经跨过的就不再邀请
      markSeen(databaseName, milestoneOf(cards.length));
      setAutoplay(true);
    }
    if (moment.kind === "invite") setInvite(moment.milestone);
  }, [graphShown, cards.length, seen, markSeen, databaseName]);

  // 自动播单独一个 effect：上面那个在 markSeen 后会因 seen 变化重跑，
  // 定时器放在那里会被它的清理函数取消
  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => {
      setAutoplay(false);
      playbackRef.current?.play();
    }, AUTOPLAY_DELAY);
    return () => clearTimeout(timer);
  }, [autoplay]);

  const captionHint = invite ? `长到 ${invite} 张了 · 看看它是怎么长出来的` : null;

  return (
    <div className="border-line-2 min-h-0 min-w-0 flex-1 overflow-hidden border-t">
      {graphShown && (
        <LinkGraph
          className="h-full w-full"
          initCards={cards}
          getCardLinks={getCardLinks}
          onClickCard={onOpenCard}
          enableHoverPreview={enableHoverPreview}
          filterCardIds={highlightIds}
          caption
          captionHint={captionHint}
          playbackRef={playbackRef}
          // 邀请只在点开播放后才算看过：没点就一直留着，直到下次跨过更高的里程碑
          onPlaybackChange={state => {
            if (!state.active || invite === null) return;
            markSeen(databaseName, invite);
            setInvite(null);
          }}
          // 全库图谱是用户反复回看的那张「地图」：优先用主进程离线算好的知识地图；
          // 取不到时退回链接图谱，其布局坐标照旧跨重启保持
          persistKey="cards-library"
          knowledgeMap={knowledgeMap.data ?? null}
        />
      )}
    </div>
  );
}
