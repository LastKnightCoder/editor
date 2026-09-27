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

import { memo, useEffect, useMemo, useRef, useState } from "react";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";
import { AnchoredPanel } from "@tau/ui";
import { Editor, EditorRef } from "@tau/editor/src";
import { getCardById } from "@/commands";
import Loading from "@/components/Loading";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import type { KnowledgeMap } from "@/knowledge-map/types";
import { ICard } from "@/types";
import { useGraphEngine, type GraphInsight } from "./useGraphEngine";

export type { GraphInsight };

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
  } = props;

  const extensions = useDynamicExtensionsStore(state => state.extensions);
  const editorRef = useRef<EditorRef>(null);
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
        editorRef.current?.setEditorValue(card.content);
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
            <Editor key={previewId} ref={editorRef} readonly extensions={extensions} />
          </AnchoredPanel.Body>
        </AnchoredPanel>
      )}
    </div>
  );
});

export default LinkGraph;
