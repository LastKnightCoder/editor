import { memo, SVGProps, forwardRef, useMemo, useContext } from "react";
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

interface BoardContentProps extends SVGProps<SVGSVGElement> {
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
      ...svgProps
    } = props;

    const { minX, minY, width, height, zoom } = viewPort;
    const selection = useContext(SelectionContext);
    const staticLayerSelection = isolateStaticSelection ? STATIC_LAYER_SELECTION : selection;

    const elementsToRender = renderElementsOverride ?? noneCenterConnectArrows;

    // 过滤视口内的元素（性能优化）
    const visibleCenterConnectArrows = useMemo(() => {
      if (disableViewportFilter) {
        return board.renderElements(centerConnectArrows);
      }
      const visibleElements = board.filterElementsInViewport(centerConnectArrows, 100);
      return board.renderVisibleElements(visibleElements);
    }, [board, centerConnectArrows, disableViewportFilter, viewPort]);

    const visibleNoneCenterConnectArrows = useMemo(() => {
      if (disableViewportFilter) {
        return board.renderElements(elementsToRender);
      }
      const visibleElements = board.filterElementsInViewport(elementsToRender, 100);
      return board.renderVisibleElements(visibleElements);
    }, [board, disableViewportFilter, elementsToRender, viewPort]);

    const visibleCenterConnectAndSelectedArrows = useMemo(() => {
      if (disableViewportFilter) {
        return board.renderElements(centerConnectAndSelectedArrows);
      }
      const visibleElements = board.filterElementsInViewport(centerConnectAndSelectedArrows, 100);
      return board.renderVisibleElements(visibleElements);
    }, [board, centerConnectAndSelectedArrows, disableViewportFilter, viewPort]);

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
        <SelectionContext.Provider value={staticLayerSelection}>
          {/* 1. 中心连接且未选中的箭头（最底层） */}
          <g data-layer="center-connect-arrows">{visibleCenterConnectArrows}</g>
          {/* 2. 非中心连接的元素（中间层） */}
          <g data-layer="main-elements">{visibleNoneCenterConnectArrows}</g>
        </SelectionContext.Provider>
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
