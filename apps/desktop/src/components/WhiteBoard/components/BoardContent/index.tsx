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
        <g>{board.renderVisibleElements(visibleCenterConnectArrows)}</g>
        <g>{board.renderVisibleElements(visibleNoneCenterConnectArrows)}</g>
        <g>
          <SelectArea />
        </g>
        <ReferenceLines lines={refLines} zoom={zoom} />
      </svg>
    );
  }),
);

export default BoardContent;
