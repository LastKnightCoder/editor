import If from '@/components/If';
import { useEffect, memo } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useSelectState, useBoard } from '../../hooks';
import { ArrowElement, Board, BoardElement, Point } from '../../types';
import Arrow from '../Arrow';
import ArrowActivePoint from './ArrowActivePoint';

interface ArrowElementProps {
  element: ArrowElement;
  onPointsChange: (board: Board, element: ArrowElement, points: Point[]) => void;
}

const ArrowElementComponent = memo((props: ArrowElementProps) => {
  const { element, onPointsChange } = props;
  const { points, lineColor, lineWidth, lineType, source, target } = element;

  const board = useBoard();
  const { isSelected } = useSelectState(element.id);

  const handleElementsChange = useMemoizedFn((elements: BoardElement[]) => {
    const sourceBindElement = elements.find(element => element.id === source?.bindId);
    const targetBindElement = elements.find(element => element.id === target?.bindId);

    let sourcePoint: Point | null = null;
    let targetPoint: Point | null = null;

    if (sourceBindElement) {
      const { connectId } = source;
      const sourceBindPoint = board.getArrowBindPoint(sourceBindElement, connectId!);
      if (sourceBindPoint) {
        sourcePoint = sourceBindPoint;
      }
    }

    if (targetBindElement) {
      const { connectId } = target;
      const targetBindPoint = board.getArrowBindPoint(targetBindElement, connectId!);
      if (targetBindPoint) {
        targetPoint = targetBindPoint;
      }
    }

    const newPoints = [...points]
    if (sourcePoint) {
      newPoints[0] = sourcePoint;
    }

    if (targetPoint) {
      newPoints[newPoints.length - 1] = targetPoint;
    }

    if (sourcePoint || targetPoint) {
      onPointsChange(board, element, newPoints);
    }
  })

  useEffect(() => {
    board.on('element:resize', handleElementsChange);
    board.on('element:move', handleElementsChange);

    return () => {
      board.off('element:resize', handleElementsChange);
      board.off('element:move', handleElementsChange);
    }
  }, [board, handleElementsChange])

  return (
    <g>
      <Arrow
        points={points}
        lineColor={lineColor}
        lineWidth={lineWidth}
        lineType={lineType}
        sourceMarker={source.marker}
        targetMarker={target.marker}
      />
      <If condition={isSelected}>
        {
          points.map((point, index) => (
            <ArrowActivePoint
              key={index}
              arrowElement={element}
              point={point}
              outerFill={lineColor}
              index={index}
            />
          ))
        }
      </If>
    </g>
  )
});

export default ArrowElementComponent;
