import { memo, useRef, useEffect } from 'react';
import { useMemoizedFn } from 'ahooks';
import { Point } from "../../types";
import { PointUtil } from '../../utils';
import { useBoard } from '../../hooks';
import { BOARD_TO_CONTAINER } from '../../constants';

interface ArrowActivePointProps {
  point: Point;
  innerSize?: number;
  innerFill?: string;
  outerSize?: number;
  outerFill?: string;
  index: number;
  onMove?: (startPoint: Point, endPoint: Point, index: number) => void;
}

const ArrowActivePoint = memo((props: ArrowActivePointProps) => {
  const { point, innerSize = 4, innerFill = '#FFFFFF', outerSize = 6, outerFill, onMove, index } = props;

  const board = useBoard();

  const ref = useRef<SVGGElement>(null);
  const startPoint = useRef<Point | null>(null);

  const handleOnMove = useMemoizedFn((startPoint: Point, endPoint: Point) => {
    onMove?.(startPoint, endPoint, index);
  });

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

      boardContainer.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    }
    const handlePointerMove = (e: PointerEvent) => {
      if (!startPoint.current) return;
      const endPoint = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!endPoint) return;
      handleOnMove(startPoint.current, endPoint);
    }

    const handlePointerUp = () => {
      startPoint.current = null;
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;
      boardContainer.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    }

    g.addEventListener('pointerdown', handlePointerDown);

    return () => {
      g.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;
      boardContainer.removeEventListener('pointermove', handlePointerMove);
    }
  }, [handleOnMove])

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