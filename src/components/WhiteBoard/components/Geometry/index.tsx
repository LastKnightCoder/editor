import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import If from '@/components/If';
import Editor, { EditorRef } from '@/components/Editor';
import classnames from 'classnames';
import ResizeCircle from '../ResizeCircle';
import ArrowConnectPoint from '../ArrowConnectPoint';
import ArrowDropConnectPoint from '../ArrowDropConnectPoint';

import { Board, EHandlerPosition, Point } from '../../types';
import { PointUtil, transformPath } from '../../utils';
import { useBoard, useSelectState, useDropArrow } from '../../hooks';
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

import styles from './index.module.less';

interface GeometryProps {
  element: GeometryElement;
  onResizeStart?: (element: GeometryElement, startPoint: Point) => void;
  onResize: (board: Board, element: GeometryElement, position: EHandlerPosition, startPoint: Point, endPoint: Point, isPreserveRatio?: boolean) => void;
  onResizeEnd?: (board: Board, element: GeometryElement, position: EHandlerPosition, startPoint: Point, endPoint: Point) => void;
}

const Geometry = memo((props: GeometryProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;

  const { 
    id, 
    x, 
    y, 
    width, 
    height, 
    paths, 
    fillOpacity, 
    fill, 
    stroke, 
    strokeWidth,
    strokeOpacity,
    text
  } = element;

  const [isEditing, setIsEditing] = useState(false);

  const board = useBoard();
  const { isSelected } = useSelectState(id);
  const geometryRef = useRef<SVGGElement>(null);
  const textRef = useRef<EditorRef>(null);
  const [textContent] = useState(text.content);

  const { isMoveArrowClosing, activeConnectId, arrowConnectPoints, arrowConnectExtendPoints } = useDropArrow(element);

  const [resizePoints] = useMemo(() => {
    const resizePoints = PointUtil.getResizePointFromRect({
      x,
      y,
      width,
      height
    });

    return [resizePoints];
  }, [x, y, width, height]);

  const handleOnResizeStart = useMemoizedFn((startPoint: Point) => {
    onResizeStart?.(element, startPoint);
  });

  const handleOnResize = useMemoizedFn((position: EHandlerPosition, startPoint: Point, endPoint: Point, isPreserveRatio?: boolean) => {
    onResize(board, element, position, startPoint, endPoint, isPreserveRatio);
  });

  const handleOnResizeEnd = useMemoizedFn((position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
    onResizeEnd?.(board, element, position, startPoint, endPoint);
  });

  const handleOnFocus = useMemoizedFn(() => {
    setIsEditing(true);
  })

  const handleOnBlur = useMemoizedFn(() => {
    // 延迟设为 readonly
    setTimeout(() => {
      setIsEditing(false);
      textRef.current?.deselect();
    }, 100)
  })

  const handleDbClick = useMemoizedFn((e: MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setTimeout(() => {
      textRef.current?.focus();
    })
    board.apply([{
      type: 'set_selection',
      properties: board.selection,
      newProperties: {
        selectArea: null,
        selectedElements: []
      }
    }], false);
  });

  const handlePointerDown = useMemoizedFn((e: MouseEvent) => {
    // 禁止移动元素，需要选中文字
    if (isEditing) {
      e.stopPropagation();
    }
  })

  useEffect(() => {
    const container = geometryRef.current;
    if (!container) return;

    container.addEventListener('dblclick', handleDbClick);
    container.addEventListener('pointerdown', handlePointerDown);

    return () => {
      if (container) {
        container.removeEventListener('dblclick', handleDbClick);
        container.removeEventListener('pointerdown', handlePointerDown);
      }
    }
  }, [handleDbClick, handlePointerDown]);

  return (
    <g ref={geometryRef}>
      <svg 
        style={{ overflow: "visible" }} 
        key={id} 
        x={x} 
        y={y} 
        width={width} 
        height={height} 
        viewBox={`0 0 ${width} ${height}`}
      >
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
                strokeOpacity={strokeOpacity}
              />
            )
          })
        }
      </svg>
      <foreignObject x={x} y={y} width={width} height={height}>
        <div className={classnames(styles.textContainer, styles[text.align], { [styles.readonly]: !isEditing })}>
          <Editor
            ref={textRef}
            initValue={textContent}
            onFocus={handleOnFocus}
            onBlur={handleOnBlur}
            readonly={!isEditing}
          />
        </div>
      </foreignObject>
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
            arrowConnectExtendPoints.map((point) => (
              <ArrowConnectPoint
                key={point.connectId}
                element={element}
                connectId={point.connectId}
                x={point.point.x}
                y={point.point.y}
                r={ARROW_CONNECT_POINT_RADIUS}
                fill={ARROW_CONNECT_POINT_FILL}
              />
            ))
          }
        </g>
      </If>
      <If condition={isMoveArrowClosing}>
        {
          arrowConnectPoints.map((point) => (
            <ArrowDropConnectPoint
              key={point.connectId}
              cx={point.point.x}
              cy={point.point.y}
              isActive={activeConnectId === point.connectId}
            />
          ))
        }
      </If>
    </g>
  );
});

export default Geometry;