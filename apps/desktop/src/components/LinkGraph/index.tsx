/**
 * 关联图谱 —— 自研 canvas 实现（批次 1：core 层 + Canvas 2D 渲染器）。
 *
 * 替换掉原来的 @antv/g6 版本：那版 700 行里大半是在 G6 之外自己算连通分量和
 * 簇位置，定制成本已经付了，而节点样式、标签、镜头动画反被 G6 的 API 限住。
 * 现在分层为 core（图/布局/相机/命中/调色板）+ renderers + 本文件（React 壳）。
 *
 * 本文件只做三件事：挂 canvas、把 props 翻译成引擎参数、渲染悬停预览面板。
 * props 与旧版完全一致，三个调用点无需改动。
 */

import { memo, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { getContentKit } from "@/services/editorKit";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";
import { AnchoredPanel } from "@tau/ui";
import { Editor, createValueDocument, type EditorDocument } from "@tau/editor";
import { getCardById } from "@/commands";
import Loading from "@/components/Loading";
import type { KnowledgeMap } from "@/knowledge-map/types";
import { ICard } from "@/types";
import { GraphCaption } from "./GraphCaption";
import { useGraphEngine, type GraphInsight, type PlaybackState } from "./useGraphEngine";

export type { GraphInsight, PlaybackState };

/** 宿主手里的动画把手：用于「第一次进入自动播一次」这类时机触发 */
export interface LinkGraphPlaybackHandle {
  play: () => void;
  stop: () => void;
}

interface ILinkGraphProps {
  initCards: ICard[];
  getCardLinks?: (card: ICard) => number[];
  className?: string;
  style?: React.CSSProperties;
  cardWidth?: number;
  cardMaxHeight?: number;
  cardFontSize?: number;
  /** 当前卡片（通常一两张，如正在编辑的那张）：accent 强调 */
  currentCardIds?: number[];
  /**
   * 筛选命中的卡片；null / 不传表示没有筛选。命中的保持主题色，未命中的降淡。
   * 筛选结果可能是几百张，不要走 currentCardIds（那会把整张图刷成 accent）
   */
  filterCardIds?: number[] | null;
  fitView?: boolean;
  /** 兼容旧签名（G6 的 padding 数组）；自研版只用第一个值 */
  fitViewPadding?: number[];
  onClickCard?: (card: ICard) => void;
  enableHoverPreview?: boolean;
  /**
   * 传了就把布局坐标按这个键落盘（IndexedDB），重开即刻恢复上次的图形。
   * 全库图谱该传（那是用户的「地图」），临时子图不要传——见 GraphEngineOptions.persistKey。
   */
  persistKey?: string;
  /** 簇划分算完后回调（主题簇、桥接、孤立卡片、模块度），宿主可据此做洞见提示 */
  onClusters?: (insight: GraphInsight) => void;
  /** 离线知识地图；传了就按它的坐标与主题画，不跑布局（见 useGraphEngine） */
  knowledgeMap?: KnowledgeMap | null;
  /**
   * 画布左下角的说明行（「674 张卡片 · 始于 2021 年 3 月」），同时是入场动画的入口：
   * 点一下按创建时间播放卡片的生长过程。不开就没有动画——局部子图没有回放的意义
   */
  caption?: boolean;
  /** 临时替换说明行的邀请语（卡片数跨过里程碑时），null 表示显示平常的描述 */
  captionHint?: string | null;
  /** 动画把手：宿主据此做时机触发（第一次进入自动播一次） */
  playbackRef?: Ref<LinkGraphPlaybackHandle>;
  /** 播放开始 / 结束 */
  onPlaybackChange?: (state: PlaybackState) => void;
}

const defaultFitViewPadding = [40];
const defaultGetCardLinks = (card: ICard) => card.links;

const LinkGraph = memo((props: ILinkGraphProps) => {
  const {
    className,
    style,
    initCards,
    cardWidth = 420,
    cardMaxHeight = 360,
    cardFontSize,
    currentCardIds,
    filterCardIds,
    getCardLinks = defaultGetCardLinks,
    fitView = true,
    fitViewPadding = defaultFitViewPadding,
    onClickCard,
    enableHoverPreview = true,
    persistKey,
    onClusters,
    knowledgeMap,
    caption = false,
    captionHint = null,
    playbackRef,
    onPlaybackChange,
  } = props;

  // 说明行的「始于」：最早一张卡的创建时间
  const since = useMemo(() => {
    let earliest = 0;
    for (const card of initCards) {
      const time = card.create_time ?? 0;
      if (time > 0 && (earliest === 0 || time < earliest)) earliest = time;
    }
    return earliest;
  }, [initCards]);

  const [previewDocument, setPreviewDocument] = useState<{
    id: number;
    document: EditorDocument;
  } | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  // 锚点是一个零尺寸空 div：AnchoredPanel 要的是 DOM 元素，而我们只有 canvas 坐标
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const padding = fitViewPadding[0] ?? 40;

  const handleHoverNode = useMemoizedFn(
    (payload: { id: number; canvasX: number; canvasY: number } | null) => {
      if (!payload) {
        setAnchor(null);
        setPreviewId(null);
        return;
      }
      const element = anchorRef.current;
      if (!element) return;
      element.style.left = `${payload.canvasX}px`;
      element.style.top = `${payload.canvasY}px`;
      setPreviewId(payload.id);
      setAnchor(element);
    }
  );

  const handleClickNode = useMemoizedFn((card: ICard) => {
    setAnchor(null);
    setPreviewId(null);
    onClickCard?.(card);
  });

  // 指针从画布移进预览面板时保持悬停：用户是去读 / 滚动正文的
  const keepHoverOnLeave = useMemoizedFn(
    (target: EventTarget | null) =>
      target instanceof Node && Boolean(panelRef.current?.contains(target))
  );

  const engine = useGraphEngine({
    cards: initCards,
    getCardLinks,
    currentCardIds,
    filterCardIds,
    fitView,
    fitViewPadding: padding,
    enableHoverPreview,
    persistKey,
    knowledgeMap,
    onClusters,
    onClickNode: handleClickNode,
    onHoverNode: handleHoverNode,
    keepHoverOnLeave,
  });

  useImperativeHandle(
    playbackRef,
    () => ({ play: engine.playback.play, stop: engine.playback.stop }),
    [engine.playback.play, engine.playback.stop]
  );
  const playbackActive = engine.playback.state.active;
  const emitPlayback = useMemoizedFn(() => onPlaybackChange?.(engine.playback.state));
  useEffect(emitPlayback, [playbackActive, emitPlayback]);

  // 离开面板：回到画布就交还给画布的悬停判定，去别处就收起
  const handlePanelLeave = useMemoizedFn((event: React.PointerEvent) => {
    if (event.relatedTarget === engine.canvasRef.current) return;
    engine.clearHover();
  });

  useEffect(() => {
    if (previewId === null) return;
    let cancelled = false;
    getCardById(previewId)
      .then(card => {
        if (cancelled) return;
        setPreviewDocument({ id: previewId, document: createValueDocument(card.content) });
      })
      .catch(() => {
        if (!cancelled) setAnchor(null);
      });
    return () => {
      cancelled = true;
    };
  }, [previewId]);

  // Body 的高度上限由它自己的 min(60vh, 420px) 兜底，宿主想收更紧就用 CSS 变量覆盖
  // （Body 只接 children/className，不接 style）
  const panelStyle = useMemo(
    () =>
      ({
        width: cardWidth,
        fontSize: cardFontSize,
        "--graph-preview-max-h": `${cardMaxHeight}px`,
      }) as React.CSSProperties,
    [cardWidth, cardFontSize, cardMaxHeight]
  );

  return (
    <div
      ref={engine.containerRef}
      // 不自带底色：宿主可能是 page 环境，也可能是 surface 卡里的一块区域
      // （卡片库图谱视图就是后者，刷 bg-page 等于在卡上挖个洞）。
      // 真实底色由引擎从容器向上取，用于算对比度。
      className={classnames("relative h-full w-full overflow-hidden", className)}
      style={style}
    >
      <canvas ref={engine.canvasRef} className="block h-full w-full touch-none" />
      <div ref={anchorRef} className="pointer-events-none absolute h-0 w-0" />
      {caption && engine.ready && (
        <GraphCaption
          playback={engine.playback}
          total={initCards.length}
          since={since}
          hint={captionHint}
        />
      )}
      {!engine.ready && (
        <div className="bg-page/60 absolute inset-0 flex items-center justify-center">
          <Loading />
        </div>
      )}
      {anchor && previewId !== null && (
        <AnchoredPanel
          ref={panelRef}
          anchor={anchor}
          placement="bottom-start"
          style={panelStyle}
          onPointerLeave={handlePanelLeave}
        >
          <AnchoredPanel.Body className="max-h-[var(--graph-preview-max-h)]">
            {previewDocument?.id === previewId && (
              <Editor kit={getContentKit()} document={previewDocument.document} readonly />
            )}
          </AnchoredPanel.Body>
        </AnchoredPanel>
      )}
    </div>
  );
});

export default LinkGraph;
