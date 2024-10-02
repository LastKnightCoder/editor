import React, { memo } from 'react';
import If from '@/components/If';

import { Board, EHandlerPosition, Point } from '../../types';
import { PointUtil, transformPath } from '../../utils';
import { useBoard, useSelectState } from '../../hooks';
import ResizeCircle from '../ResizeCircle';
import ArrowConnectPoint from '../ArrowConnectPoint';
import { GeometryElement } from '../../plugins';
import { 
  SELECT_RECT_STROKE, 
  SELECT_RECT_STROKE_WIDTH, 
  SELECT_RECT_FILL_OPACITY, 
  RESIZE_CIRCLE_FILL, 
  RESIZE_CIRCLE_RADIUS,
  ARROW_CONNECT_POINT_FILL,
  ARROW_CONNECT_POINT_RADIUS,
} from '../../constants';
import { useMemoizedFn } from 'ahooks';

interface GeometryProps {
  element: GeometryElement;
  onResizeStart?: (element: GeometryElement, startPoint: Point) => void;
  onResize: (board: Board, element: GeometryElement, position: EHandlerPosition, startPoint: Point, endPoint: Point) => void;
  onResizeEnd?: (element: GeometryElement, endPoint: Point) => void;
}

const Geometry = memo((props: GeometryProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;

  const { id, x, y, width, height, paths, fillOpacity, fill, stroke, strokeWidth } = element;

  const board = useBoard();
  const { isSelected } = useSelectState(id);

  const resizePoints = PointUtil.getResizePointFromRect({
    x,
    y,
    width,
    height
  });
  const arrowConnectPoints = PointUtil.getArrowConnectPoints(board, {
    x,
    y,
    width,
    height
  });

  const handleOnResizeStart = useMemoizedFn((startPoint: Point) => {
    onResizeStart?.(element, startPoint);
  });

  const handleOnResizeEnd = useMemoizedFn((endPoint: Point) => {
    onResizeEnd?.(element, endPoint);
  });

  const handleOnResize = useMemoizedFn((position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
    onResize(board, element, position, startPoint, endPoint);
  });

  return (
    <React.Fragment key={id}>
      <svg style={{ overflow: "visible" }} key={id} x={x} y={y} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {
          paths.map((path) => {
            // 提取 path 中的所有坐标，分别乘以 width 和 height
            const pathString = transformPath(path, width, height);
            return (
              <path 
                key={path} 
                d={pathString} 
                fill={fill} 
                fillOpacity={fillOpacity} 
                stroke={stroke} 
                strokeWidth={strokeWidth} 
              />
            )
          })
        }
      </svg>
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
            style={{ pointerEvents: 'none' }}
          />
          {
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
            ))
          }
          {
            arrowConnectPoints.map((point) => (
              <ArrowConnectPoint
                key={point.position}
                position={point.position}
                x={point.point.x}
                y={point.point.y}
                r={ARROW_CONNECT_POINT_RADIUS} 
                fill={ARROW_CONNECT_POINT_FILL}
              />
            ))
          }
        </g>
      </If>
    </React.Fragment>
  );
});

export default Geometry;