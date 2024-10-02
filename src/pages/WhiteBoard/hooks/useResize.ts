import React, { useEffect, useRef } from "react";
import { Point } from "../types";
import { PointUtil } from "../utils";
import { useBoard } from "./useBoard";
import { useMemoizedFn } from "ahooks";
import { BOARD_TO_CONTAINER } from "../constants";

interface IUseResize {
  ref: React.RefObject<SVGElement>;
  onResizeStart?: (startPoint: Point) => void;
  onResize: (startPoint: Point, endPoint: Point) => void;
  onResizeEnd?: (startPoint: Point, endPoint: Point) => void;
}

export const useResize = (props: IUseResize) => {
  const { ref, onResizeStart, onResize, onResizeEnd } = props;
  const board = useBoard();
  const startPoint = useRef<Point | null>(null);
  const endPoint = useRef<Point | null>(null);

  const handleResize = useMemoizedFn((startPoint: Point, endPoint: Point) => {
    onResize(startPoint, endPoint);
  });

  const handleResizeStart = useMemoizedFn((startPoint: Point) => {
    onResizeStart?.(startPoint);
  });

  const handleResizeEnd = useMemoizedFn((startPoint: Point, endPoint: Point) => {
    onResizeEnd?.(startPoint, endPoint);
  });

  useEffect(() => {
    const resizeHandle = ref.current;
    if (!resizeHandle) return;

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startPoint.current = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!startPoint.current) return;
      
      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      handleResizeStart(startPoint.current);

      boardContainer.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!startPoint.current) return;

      endPoint.current = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!endPoint.current) return;

      handleResize(startPoint.current, endPoint.current);
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (!startPoint.current) return;

      endPoint.current = PointUtil.screenToViewPort(board, e.clientX, e.clientY);
      if (!endPoint.current) return;

      handleResizeEnd(startPoint.current, endPoint.current);

      startPoint.current = null;
      endPoint.current = null;

      const boardContainer = BOARD_TO_CONTAINER.get(board);
      if (!boardContainer) return;

      boardContainer.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    }

    resizeHandle.addEventListener('pointerdown', handlePointerDown);

    return () => {
      resizeHandle.removeEventListener('pointerdown', handlePointerDown);
    }
  }, [board]);
}

export default useResize;