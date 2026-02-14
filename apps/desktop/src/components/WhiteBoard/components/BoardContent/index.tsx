import { memo, SVGProps, forwardRef, useMemo } from "react";
import { BoardElement, ViewPort } from "../../types";
import Grid from "../Grid";
import SelectArea from "../SelectArea";
import GroupSelectionBounds from "../GroupSelectionBounds";
import ReferenceLines from "../ReferenceLines";
import ArrowMarkers from "../ArrowMarkers";
import Board from "../../Board";

interface BoardContentProps extends SVGProps<SVGSVGElement> {
  board: Board;
  viewPort: ViewPort;
  centerConnectArrows: BoardElement[];
  noneCenterConnectArrows: BoardElement[];
  centerConnectAndSelectedArrows: BoardElement[];
  gridVisible?: boolean;
  gridSize?: number;
  disableViewportFilter?: boolean;
  showAssistLayers?: boolean;
  backgroundColor?: string | null;
  renderElementsOverride?: BoardElement[];
  refLines: Array<{
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }>;
}

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
      gridSize = 20,
      disableViewportFilter = false,
      showAssistLayers = true,
      backgroundColor = null,
      renderElementsOverride,
      refLines,
      ...svgProps
    } = props;

    const { minX, minY, width, height, zoom } = viewPort;

    const elementsToRender = renderElementsOverride ?? noneCenterConnectArrows;

    // 过滤视口内的元素（性能优化）
    const visibleCenterConnectArrows = useMemo(() => {
      if (disableViewportFilter) {
        return board.renderElements(centerConnectArrows);
      }
      const visibleElements = board.filterElementsInViewport(
        centerConnectArrows,
        100,
      );
      return board.renderVisibleElements(visibleElements);
    }, [board, centerConnectArrows, disableViewportFilter, viewPort]);

    const visibleNoneCenterConnectArrows = useMemo(() => {
      if (disableViewportFilter) {
        return board.renderElements(elementsToRender);
      }
      const visibleElements = board.filterElementsInViewport(
        elementsToRender,
        100,
      );
      return board.renderVisibleElements(visibleElements);
    }, [board, disableViewportFilter, elementsToRender, viewPort]);

    const visibleCenterConnectAndSelectedArrows = useMemo(() => {
      if (disableViewportFilter) {
        return board.renderElements(centerConnectAndSelectedArrows);
      }
      const visibleElements = board.filterElementsInViewport(
        centerConnectAndSelectedArrows,
        100,
      );
      return board.renderVisibleElements(visibleElements);
    }, [
      board,
      centerConnectAndSelectedArrows,
      disableViewportFilter,
      viewPort,
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
          <rect
            x={minX}
            y={minY}
            width={width}
            height={height}
            fill={backgroundColor}
          />
        )}
        <ArrowMarkers />
        <Grid visible={gridVisible} gridSize={gridSize} />
        {/* 1. 中心连接且未选中的箭头（最底层） */}
        <g>{visibleCenterConnectArrows}</g>
        {/* 2. 非中心连接的元素（中间层） */}
        <g>{visibleNoneCenterConnectArrows}</g>
        {/* 3. 中心连接且被选中的箭头（最顶层） */}
        <g>{visibleCenterConnectAndSelectedArrows}</g>
        {showAssistLayers && (
          <>
            <g data-export-ignore="true">
              <SelectArea />
            </g>
            <g data-export-ignore="true">
              <GroupSelectionBounds />
            </g>
            <g data-export-ignore="true">
              <ReferenceLines lines={refLines} zoom={zoom} />
            </g>
          </>
        )}
      </svg>
    );
  }),
);

export default BoardContent;
