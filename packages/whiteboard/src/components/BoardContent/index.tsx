import { memo, SVGProps, forwardRef, useMemo, useContext, useDeferredValue } from "react";
import type { RefObject } from "react";
import { BoardElement, Selection, ViewPort } from "../../types";
import Grid from "../Grid";
import SelectArea from "../SelectArea";
import GroupSelectionBounds from "../GroupSelectionBounds";
import ReferenceLines from "../ReferenceLines";
import ArrowMarkers from "../ArrowMarkers";
import ArrowCustomConnectOverlay from "../ArrowCustomConnectOverlay";
import MindDragOverlay from "../MindDragOverlay";
import { CreationPreview } from "../CreationPreview";
import Board from "../../Board";
import { SelectionContext } from "../../context";
import { WhiteboardPresenceOverlay, previewPeerElements } from "../../collaboration/presence";
import type { WhiteboardPeer } from "@tau/collaboration";

interface BoardContentProps extends SVGProps<SVGSVGElement> {
  peers?: readonly WhiteboardPeer[];
  board: Board;
  viewPort: ViewPort;
  centerConnectArrows: BoardElement[];
  noneCenterConnectArrows: BoardElement[];
  centerConnectAndSelectedArrows: BoardElement[];
  gridVisible?: boolean;
  disableViewportFilter?: boolean;
  isolateStaticSelection?: boolean;
  showAssistLayers?: boolean;
  backgroundColor?: string | null;
  renderElementsOverride?: BoardElement[];
  connectPointOverlayRef?: RefObject<SVGGElement | null>;
}

const STATIC_LAYER_SELECTION: Selection = {
  selectArea: null,
  selectedElements: [],
};
const EMPTY_PEERS: readonly WhiteboardPeer[] = [];

/**
 * 静态元素层（底两层）。独立 memo：BoardContent 因顶层选区 context 穿透重渲时，
 * 两层数组引用不变即整体跳过——内部 Provider 不重建，元素级选中订阅（useSelectState）
 * 不产生无谓的传播。截图树的选区隔离由宿主在树根挂 StaticSelectionContext（见 useBoardCapture）。
 */
const StaticLayers = memo(function StaticLayers({
  staticLayerSelection,
  visibleCenterConnectArrows,
  visibleNoneCenterConnectArrows,
}: {
  staticLayerSelection: Selection | null;
  visibleCenterConnectArrows: React.ReactNode;
  visibleNoneCenterConnectArrows: React.ReactNode;
}) {
  return (
    <SelectionContext.Provider value={staticLayerSelection}>
      {/* 1. 中心连接且未选中的箭头（最底层） */}
      <g data-layer="center-connect-arrows">{visibleCenterConnectArrows}</g>
      {/* 2. 非中心连接的元素（中间层） */}
      <g data-layer="main-elements">{visibleNoneCenterConnectArrows}</g>
    </SelectionContext.Provider>
  );
});

/**
 * 渲染画板内容的组件
 */
const BoardContent = memo(
  forwardRef<SVGSVGElement, BoardContentProps>((props, ref) => {
    const {
      board,
      viewPort,
      centerConnectArrows,
      noneCenterConnectArrows,
      centerConnectAndSelectedArrows,
      gridVisible = false,
      disableViewportFilter = false,
      isolateStaticSelection = false,
      showAssistLayers = true,
      backgroundColor = null,
      renderElementsOverride,
      connectPointOverlayRef,
      peers = EMPTY_PEERS,
      ...svgProps
    } = props;

    const { minX, minY, width, height, zoom } = viewPort;
    const selection = useContext(SelectionContext);
    const staticLayerSelection = isolateStaticSelection ? STATIC_LAYER_SELECTION : selection;

    const preview = (items: BoardElement[]) =>
      showAssistLayers
        ? previewPeerElements(items, peers, selection?.selectedElements ?? [])
        : items;
    const elementsToRender = preview(renderElementsOverride ?? noneCenterConnectArrows);

    // 剔除用滞后视口：平移/缩放帧只紧急更新 svg viewBox（一个属性）保证跟手，
    // 全树剔除与 JSX 重建以低优先级并发追赶；剔除盒带 100px 缓冲，滞后不可感知
    const cullViewPort = useDeferredValue(viewPort);

    // 过滤视口内的元素（性能优化）
    const visibleCenterConnectArrows = useMemo(() => {
      if (disableViewportFilter) {
        return board.renderElements(preview(centerConnectArrows));
      }
      const visibleElements = board.filterElementsInViewport(preview(centerConnectArrows), 100);
      return board.renderVisibleElements(visibleElements);
    }, [
      board,
      centerConnectArrows,
      disableViewportFilter,
      cullViewPort,
      peers,
      selection,
      showAssistLayers,
    ]);

    const visibleNoneCenterConnectArrows = useMemo(() => {
      if (disableViewportFilter) {
        return board.renderElements(elementsToRender);
      }
      const visibleElements = board.filterElementsInViewport(elementsToRender, 100);
      return board.renderVisibleElements(visibleElements);
    }, [board, disableViewportFilter, elementsToRender, cullViewPort]);

    const visibleCenterConnectAndSelectedArrows = useMemo(() => {
      if (disableViewportFilter) {
        return board.renderElements(preview(centerConnectAndSelectedArrows));
      }
      const visibleElements = board.filterElementsInViewport(
        preview(centerConnectAndSelectedArrows),
        100
      );
      return board.renderVisibleElements(visibleElements);
    }, [
      board,
      centerConnectAndSelectedArrows,
      disableViewportFilter,
      cullViewPort,
      peers,
      selection,
      showAssistLayers,
    ]);

    return (
      <svg
        {...svgProps}
        ref={ref}
        width={"100%"}
        height={"100%"}
        data-whiteboard-canvas="true"
        viewBox={`${minX} ${minY} ${width} ${height}`}
      >
        {backgroundColor && (
          <rect x={minX} y={minY} width={width} height={height} fill={backgroundColor} />
        )}
        <ArrowMarkers />
        <Grid visible={gridVisible} />
        <StaticLayers
          staticLayerSelection={staticLayerSelection}
          visibleCenterConnectArrows={visibleCenterConnectArrows}
          visibleNoneCenterConnectArrows={visibleNoneCenterConnectArrows}
        />
        {/* 连接点覆盖层（位于中间层之上，但低于选中箭头层） */}
        <g ref={connectPointOverlayRef} data-layer="connect-point-overlay" />
        {/* 自定义连接点：常驻标记 + 拖拽时吸附反馈，通过 overlay 上下文 portal 到上方覆盖层 */}
        <ArrowCustomConnectOverlay />
        {/* 3. 中心连接且被选中的箭头（最顶层） */}
        <g data-layer="selected-interaction-elements">{visibleCenterConnectAndSelectedArrows}</g>
        <MindDragOverlay board={board} />
        {/* 创建手势预览：所有元素之上、选择/辅助层之下，不参与命中 */}
        <CreationPreview board={board} zoom={zoom} />
        {showAssistLayers && (
          <>
            <WhiteboardPresenceOverlay peers={peers} zoom={zoom} />
            <g data-export-ignore="true">
              <SelectArea />
            </g>
            <g data-export-ignore="true">
              <GroupSelectionBounds />
            </g>
            <g data-export-ignore="true">
              <ReferenceLines board={board} zoom={zoom} />
            </g>
          </>
        )}
      </svg>
    );
  })
);

export default BoardContent;
