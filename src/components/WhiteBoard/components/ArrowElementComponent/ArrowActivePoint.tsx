import { memo, useRef, useEffect } from 'react';
import { ArrowElement, Point } from "../../types";
import { PathUtil, PointUtil } from '../../utils';
import { useBoard, useMoveArrow } from '../../hooks';
import { BOARD_TO_CONTAINER } from '../../constants';
import { useMemoizedFn, useThrottleFn } from 'ahooks';

interface ArrowActivePointProps {
  arrowElement: ArrowElement;
  point: Point;
  innerSize?: number;
  innerFill?: string;
  outerSize?: number;
  outerFill?: string;
  index: number;
}

const ArrowActivePoint = memo((props: ArrowActivePointProps) => {
  const { point, innerSize = 3, innerFill = '#FFFFFF', outerSize = 5, outerFill, index, arrowElement } = props;

  // 防止监听 element 变化无限更新
  const lastArrowElement = useRef<ArrowElement>(arrowElement);
  const originalArrowElement = useRef<ArrowElement>(arrowElement);
  const pathRef = useRef<number[] | null>(null);

  const board = useBoard();

  const ref = useRef<SVGGElement>(null);
  const startPoint = useRef<Point | null>(null);
  const currentPoint = useRef<Point | null>(null);
  const isMoved = useRef(false);

  const {
    getUpdateArrowElement
  } = useMoveArrow({
    isMoved,
    currentPoint
  })

  const { run: handlePointerMove } = useThrottleFn((e: PointerEvent) => {
    if (!startPoint.current) return;

    const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
    if (!endPoint) return;

    currentPoint.current = endPoint;
    if (!isMoved.current) {
      isMoved.current = true;
    }

    const updateArrowElement = getUpdateArrowElement(lastArrowElement.current, currentPoint.current, index);
    if (!pathRef.current) {
      pathRef.current = PathUtil.getPathByElement(board, lastArrowElement.current);
    }

    if (pathRef.current) {
      board.apply([{
        type: 'set_node',
        path: pathRef.current,
        properties: lastArrowElement.current,
        newProperties: updateArrowElement
      }, {
        type: 'set_selection',
        properties: board.selection,
        newProperties: {
          selectArea: null,
          selectedElements: [updateArrowElement]
        }
      }], false);

      board.emit('arrow:update', {
        arrow: lastArrowElement.current,
        path: pathRef.current,
        currentPoint: currentPoint.current,
      });

      lastArrowElement.current = updateArrowElement;
    }
  }, { wait: 25 })

  const handlePointerUp = useMemoizedFn(() => {
    if (startPoint.current && isMoved.current && currentPoint.current) {
      const updateArrowElement = getUpdateArrowElement(lastArrowElement.current, currentPoint.current, index);
      if (!pathRef.current) {
        pathRef.current = PathUtil.getPathByElement(board, lastArrowElement.current);
      }
  
      if (pathRef.current) {
        board.apply([{
          type: 'set_node',
          path: pathRef.current,
          properties: originalArrowElement.current,
          newProperties: updateArrowElement
        }], true);
      }
    }

    startPoint.current = null;
    currentPoint.current = null;
    isMoved.current = false;
    pathRef.current = null;
    lastArrowElement.current = arrowElement;
    originalArrowElement.current = arrowElement;
    
    board.emit('arrow:move-end');

    const boardContainer = BOARD_TO_CONTAINER.get(board);
    document.removeEventListener('pointerup', handlePointerUp);
    if (!boardContainer) return;
    boardContainer.removeEventListener('pointermove', handlePointerMove);
  })

  useEffect(() => {
    const g = ref.current;
    if (!g) return;

    const handlePointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      startPoint.current = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!startPoint.current) return;

      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      const path = PathUtil.getPathByElement(board, lastArrowElement.current);
      if (!path) return;
      // 这里的 lastArrowElement 可能不是最新的，因为可能拖动了另一端的箭头，所以需要重新获取一次
      // TODO 优化，是否可以不每次都查找，可能有性能问题，比如如果有对箭头操作就记录，查找有改动才读取
      lastArrowElement.current = PathUtil.getElementByPath(board, path) as ArrowElement;

      boardContainer.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    }

    g.addEventListener('pointerdown', handlePointerDown);

    return () => {
      g.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;
      boardContainer.removeEventListener('pointermove', handlePointerMove);
    }
  }, [getUpdateArrowElement, board, handlePointerMove, handlePointerUp]);

  return (
    <g ref={ref}>
      <circle
        cx={point.x}
        cy={point.y}
        r={outerSize}
        fill={outerFill}
      />
      <circle
        cx={point.x}
        cy={point.y}
        r={innerSize}
        fill={innerFill}
      />
    </g>
  )
});

export default ArrowActivePoint;
