import { memo, useMemo, useState } from 'react';
import { useAsyncEffect, useMemoizedFn } from 'ahooks';
import If from '@/components/If';
import ResizeCircle from '../ResizeCircle';
import ArrowConnectPoint from '../ArrowConnectPoint';
import ArrowDropConnectPoint from '../ArrowDropConnectPoint';

import { Board, EHandlerPosition, Point, ImageElement } from '../../types';
import { PointUtil } from '../../utils';
import { useBoard, useSelectState, useDropArrow } from '../../hooks';
import {
  SELECT_RECT_STROKE,
  SELECT_RECT_STROKE_WIDTH,
  SELECT_RECT_FILL_OPACITY,
  RESIZE_CIRCLE_FILL,
  RESIZE_CIRCLE_RADIUS,
  ARROW_CONNECT_POINT_FILL,
  ARROW_CONNECT_POINT_RADIUS,
} from '../../constants';
import { remoteResourceToLocal } from '@/utils';
import { convertFileSrc } from '@/commands';

interface ImageElementProps {
  element: ImageElement;
  onResizeStart?: (element: ImageElement, startPoint: Point) => void;
  onResize: (board: Board, element: ImageElement, position: EHandlerPosition, startPoint: Point, endPoint: Point, isPreserveRatio?: boolean, isAdsorb?: boolean) => void;
  onResizeEnd?: (board: Board, element: ImageElement, position: EHandlerPosition, startPoint: Point, endPoint: Point) => void;
}

const ImageElementComponent = memo((props: ImageElementProps) => {
  const { element, onResize, onResizeStart, onResizeEnd } = props;

  const { id, x, y, width, height, src } = element;

  const [isConverting, setIsConverting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(src);

  useAsyncEffect(async () => {
    setIsConverting(true);
    try{ 
      if (src.startsWith('http')) {
          const localUrl = await remoteResourceToLocal(src);
          const filePath = convertFileSrc(localUrl);
          setPreviewUrl(filePath);
      } else {
        const filePath = convertFileSrc(src);
        setPreviewUrl(filePath);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setIsConverting(false);
    }
  }, [src]);
  
  const onLoadImageError = () => {
    setPreviewUrl(src);
  }

  const board = useBoard();
  const { isSelected } = useSelectState(id);

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

  const handleOnResize = useMemoizedFn((position: EHandlerPosition, startPoint: Point, endPoint: Point, isPreserveRatio?: boolean, isAdsorb?: boolean) => {
    onResize(board, element, position, startPoint, endPoint, isPreserveRatio, isAdsorb);
  });

  const handleOnResizeEnd = useMemoizedFn((position: EHandlerPosition, startPoint: Point, endPoint: Point) => {
    onResizeEnd?.(board, element, position, startPoint, endPoint);
  });

  if (isConverting) {
    return null;
  }

  return (
    <>
      <foreignObject
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          userSelect: 'none'
        }}
      >
        <img
          src={previewUrl}
          onError={onLoadImageError}
          width={width}
          height={height}
          alt={''}
          onDoubleClick={(e) => {
            e.stopPropagation();
          }}
          style={{
            objectFit: 'contain',
            objectPosition: 'center',
            userSelect: 'none'
          }}
        />
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
    </>
  );
});

export default ImageElementComponent;
