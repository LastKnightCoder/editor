import { memo, SVGProps, forwardRef, useMemo } from "react";
import { BoardElement, ViewPort } from "../../types";
import Grid from "../Grid";
import SelectArea from "../SelectArea";
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
      refLines,
      ...svgProps
    } = props;

    const { minX, minY, width, height, zoom } = viewPort;

    // 过滤视口内的元素（性能优化）
    const visibleCenterConnectArrows = useMemo(
      () => board.filterElementsInViewport(centerConnectArrows, 100),
      [board, centerConnectArrows, viewPort],
    );

    const visibleNoneCenterConnectArrows = useMemo(
      () => board.filterElementsInViewport(noneCenterConnectArrows, 100),
      [board, noneCenterConnectArrows, viewPort],
    );

    const visibleCenterConnectAndSelectedArrows = useMemo(
      () => board.filterElementsInViewport(centerConnectAndSelectedArrows, 100),
      [board, centerConnectAndSelectedArrows, viewPort],
    );

    return (
      <svg
        {...svgProps}
        ref={ref}
        width={"100%"}
        height={"100%"}
        viewBox={`${minX} ${minY} ${width} ${height}`}
      >
        <ArrowMarkers />
        <Grid visible={gridVisible} gridSize={gridSize} />
        {/* 1. 中心连接且未选中的箭头（最底层） */}
        <g>{board.renderVisibleElements(visibleCenterConnectArrows)}</g>
        {/* 2. 非中心连接的元素（中间层） */}
        <g>{board.renderVisibleElements(visibleNoneCenterConnectArrows)}</g>
        {/* 3. 中心连接且被选中的箭头（最顶层） */}
        <g>
          {board.renderVisibleElements(visibleCenterConnectAndSelectedArrows)}
        </g>
        <g>
          <SelectArea />
        </g>
        <ReferenceLines lines={refLines} zoom={zoom} />
      </svg>
    );
  }),
);

export default BoardContent;
