import If from '@/components/If';
import { useEffect, memo } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useSelectState, useBoard } from '../../hooks';
import { ArrowElement, BoardElement, Operation, Point } from '../../types';
import Arrow from '../Arrow';
import ArrowActivePoint from './ArrowActivePoint';
import { PathUtil } from '../../utils';

interface ArrowElementProps {
  element: ArrowElement;
}

const ArrowElementComponent = memo((props: ArrowElementProps) => {
  const { element } = props;
  const { points, lineColor, lineWidth, lineType, source, target } = element;

  const board = useBoard();
  const { isSelected } = useSelectState(element.id);

  const handleElementsRemove = useMemoizedFn((elements: BoardElement[]) => {
    const sourceBindElement = elements.find(element => element.id === source?.bindId);
    const targetBindElement = elements.find(element => element.id === target?.bindId);

    if (sourceBindElement || targetBindElement) {
      const newElement = {
        ...element,
        source: sourceBindElement ? { marker: element.source.marker } : element.source,
        target: targetBindElement ? { marker: element.target.marker } : element.target
      }
      const path = PathUtil.getPathByElement(board, element);
      if (!path) return;

      const undos = board.undos;
      let updateHistory = true;
      const op: Operation = {
        type: 'set_node',
        path,
        properties: element,
        newProperties: newElement
      }
      // 取消箭头绑定的操作和删除元素的操作放到一个 undo 里面，这样恢复时可以一起恢复，不用按两下 Ctrl + Z
      if (undos.length > 0) {
        const lastBatch = undos[undos.length - 1];
        if (lastBatch.length > 0) {
          const lastOp = lastBatch[lastBatch.length - 1];
          const { type } = lastOp;
          if (type === 'remove_node' && (lastOp.node.id === sourceBindElement?.id || lastOp.node.id === targetBindElement?.id)) {
            lastBatch.push(op)
            updateHistory = false;
          }
        }
      }

      board.apply([op], updateHistory);
    }
  })


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
      const path = PathUtil.getPathByElement(board, element);
      if (!path) return;

      const newElement = {
        ...element,
        points: newPoints,
      }
      board.apply([{
        type: 'set_node',
        path,
        properties: element,
        newProperties: newElement,
      }], false)
    }
  })

  useEffect(() => {
    board.on('element:change', handleElementsChange);
    board.on('element:remove', handleElementsRemove);
    return () => {
      board.off('element:change', handleElementsChange);
      board.off('element:remove', handleElementsRemove);
    }
  }, [board, handleElementsChange, handleElementsRemove])

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