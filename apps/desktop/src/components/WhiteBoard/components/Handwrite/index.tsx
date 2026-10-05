import { memo, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import If from "@/components/If";
import ResizeCircle from "../ResizeCircle";
import ArrowConnectPointGroup from "../ArrowConnectPointGroup";
import ArrowDropConnectPoint from "../ArrowDropConnectPoint";
import { Board, EHandlerPosition, Point } from "../../types";
import {
  SELECT_RECT_FILL_OPACITY,
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
} from "../../constants";
import { denormalizeOutline, outlineToSvgPath, PointUtil } from "../../utils";
import { useBoard, useDropArrow, useSelectState } from "../../hooks";
import { getDefaultThemeColorId, getThemeColorById } from "../../constants/theme-colors";
import useTheme from "@/hooks/useTheme";
import type { HandwriteElement } from "../../plugins/HandwritePlugin";
const styles = { container: "", strokePath: "[pointer-events:visiblePainted]" };

interface HandwriteProps {
  element: HandwriteElement;
  onResizeStart?: (element: HandwriteElement, startPoint: Point) => void;
  onResize: (
    board: Board,
    element: HandwriteElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point,
    isPreserveRatio?: boolean,
    isAdsorb?: boolean
  ) => void;
  onResizeEnd?: (
    board: Board,
    element: HandwriteElement,
    position: EHandlerPosition,
    startPoint: Point,
    endPoint: Point
  ) => void;
}

const Handwrite = memo((props: HandwriteProps) => {
  const { element, onResizeStart, onResize, onResizeEnd } = props;
  const { id, x, y, width, height, style, resizable = true } = element;

  const board = useBoard();
  const { isDark } = useTheme();
  const { isSelected } = useSelectState(id);

  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } =
    useDropArrow(element);

  const outlinePoints = useMemo(() => {
    return denormalizeOutline(element.outline, {
      x,
      y,
      width,
      height,
    });
  }, [element.outline, x, y, width, height]);

  const pathData = useMemo(() => outlineToSvgPath(outlinePoints), [outlinePoints]);

  const themeColorPair = getThemeColorById(style.themeColorId || getDefaultThemeColorId());
  const fillColor = themeColorPair
    ? isDark
      ? themeColorPair.dark
      : themeColorPair.light
    : isDark
      ? "#f5f5f5"
      : "#1f1f1f";

  const resizePoints = useMemo(() => {
    return PointUtil.getResizePointFromRect({
      x,
      y,
      width,
      height,
    });
  }, [x, y, width, height]);

  const handleOnResizeStart = useMemoizedFn((startPoint: Point) => {
    onResizeStart?.(element, startPoint);
  });

  const handleOnResize = useMemoizedFn(
    (
      position: EHandlerPosition,
      startPoint: Point,
      endPoint: Point,
      isPreserveRatio?: boolean,
      isAdsorb?: boolean
    ) => {
      onResize(board, element, position, startPoint, endPoint, isPreserveRatio, isAdsorb);
    }
  );

  const handleOnResizeEnd = useMemoizedFn(
    (position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
      onResizeEnd?.(board, element, position, startPoint, endPoint);
    }
  );

  return (
    <g className={styles.container}>
      <path
        className={styles.strokePath}
        d={pathData}
        fill={fillColor}
        fillOpacity={style.opacity}
      />

      <If condition={isSelected}>
        <g>
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fillOpacity={SELECT_RECT_FILL_OPACITY}
            stroke={SELECT_RECT_STROKE}
            strokeWidth={SELECT_RECT_STROKE_WIDTH}
            style={{ pointerEvents: "none" }}
          />

          {resizable &&
            Object.entries(resizePoints).map(([position, point]) => (
              <ResizeCircle
                key={position}
                cx={point.x}
                cy={point.y}
                r={RESIZE_CIRCLE_RADIUS}
                fill={RESIZE_CIRCLE_FILL}
                position={position as EHandlerPosition}
                onResizeStart={handleOnResizeStart}
                onResize={handleOnResize}
                onResizeEnd={handleOnResizeEnd}
              />
            ))}
        </g>
      </If>
      <ArrowConnectPointGroup
        element={element}
        points={arrowConnectExtendPoints}
        isSelected={isSelected}
        disabled={isMoveArrowClosing}
      />

      <If condition={isMoveArrowClosing}>
        {arrowConnectPoints.map(point => (
          <ArrowDropConnectPoint
            key={point.connectId}
            cx={point.point.x}
            cy={point.point.y}
            isActive={activeConnectId === point.connectId}
          />
        ))}
      </If>
    </g>
  );
});

export default Handwrite;
