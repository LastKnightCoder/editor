import { memo, SVGProps, forwardRef, useMemo, useContext, useRef, useLayoutEffect } from "react";
import type { RefObject } from "react";
import { BoardElement, Selection, ViewPort } from "../../types";
import { CULL_CELL_PX, viewportCellStart } from "../../utils/ViewportUtil";
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
import {
  WhiteboardPresenceOverlay,
  previewPeerElements,
  alignPeerSelections,
} from "../../collaboration/presence";
import type { WhiteboardPeer } from "@tau/collaboration";

interface BoardContentProps extends SVGProps<SVGSVGElement> {
  cameraRef?: RefObject<HTMLDivElement | null>;
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

/** 每个渲染层只保留自己上次提交的可见集合，避免空箭头层清除文档层的退出缓冲。 */
function useVisibleLayer(board: Board, elements: BoardElement[], viewport: ViewPort | null) {
  const retained = useRef(new Set<string>());
  const layer = useMemo(() => {
    const current = new Set<string>();
    const nodes = viewport
      ? board.renderVisibleElements(
          board.filterElementsInViewport(elements, CULL_CELL_PX, viewport, {
            previous: retained.current,
            current,
          })
        )
      : board.renderElements(elements);
    return { current, nodes };
  }, [board, elements, viewport]);
  useLayoutEffect(() => {
    retained.current = layer.current;
  }, [layer]);
  return layer.nodes;
}

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
      cameraRef,
      ...svgProps
    } = props;

    const { minX, minY, width, height, zoom } = viewPort;
    const selection = useContext(SelectionContext);
    const staticLayerSelection = isolateStaticSelection ? STATIC_LAYER_SELECTION : selection;

    const preview = (items: BoardElement[]) =>
      showAssistLayers && peers.length
        ? previewPeerElements(
            items,
            peers,
            version => board.document?.hasPresenceVersion?.(version) ?? true
          )
        : items;
    const mainElements = preview(renderElementsOverride ?? noneCenterConnectArrows);
    const behind = preview(centerConnectArrows);
    const inFront = preview(centerConnectAndSelectedArrows);
    const alignedPeers =
      showAssistLayers && peers.some(peer => peer.selection.length)
        ? alignPeerSelections(board, [...mainElements, ...behind, ...inFront], peers)
        : peers;

    // SVG 多铺一格覆盖平移余量，格内只平移合成层，跨格或缩放时重设 viewBox。
    const cell = CULL_CELL_PX / zoom;
    const left = viewportCellStart(minX, zoom);
    const top = viewportCellStart(minY, zoom);
    const cullViewport = useMemo(
      () =>
        disableViewportFilter
          ? null
          : { minX: left, minY: top, width: width + cell, height: height + cell, zoom },
      [disableViewportFilter, left, top, width, height, cell, zoom]
    );
    const visibleCenterConnectArrows = useVisibleLayer(board, behind, cullViewport);
    const visibleNoneCenterConnectArrows = useVisibleLayer(board, mainElements, cullViewport);
    const visibleCenterConnectAndSelectedArrows = useVisibleLayer(board, inFront, cullViewport);

    const svgViewport = cullViewport ?? viewPort;
    const svgSize = cullViewport ? `calc(100% + ${CULL_CELL_PX}px)` : "100%";
    const svg = (
      <svg
        {...svgProps}
        ref={ref}
        width={cameraRef ? "100%" : svgSize}
        height={cameraRef ? "100%" : svgSize}
        style={
          cullViewport && !cameraRef
            ? {
                ...svgProps.style,
                transform: `translate3d(${(left - minX) * zoom}px, ${(top - minY) * zoom}px, 0)`,
              }
            : svgProps.style
        }
        data-whiteboard-canvas="true"
        viewBox={`${svgViewport.minX} ${svgViewport.minY} ${svgViewport.width} ${svgViewport.height}`}
      >
        {backgroundColor && (
          <rect x={minX} y={minY} width={width} height={height} fill={backgroundColor} />
        )}
        <ArrowMarkers />
        <Grid visible={gridVisible} viewPort={svgViewport} />
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
            <WhiteboardPresenceOverlay peers={alignedPeers} zoom={zoom} />
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
    return cameraRef ? (
      <div
        data-whiteboard-camera
        ref={cameraRef}
        style={{
          width: svgSize,
          height: svgSize,
          contain: "layout paint",
          willChange: "transform",
        }}
      >
        {svg}
      </div>
    ) : (
      svg
    );
  })
);

export default BoardContent;
