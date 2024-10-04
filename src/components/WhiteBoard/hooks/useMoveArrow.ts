import { useEffect, useRef, MutableRefObject } from "react";
import { ArrowElement, BoardElement, Point } from "../types";
import { useBoard } from "./useBoard";
import { isValid } from "../utils";
import { useMemoizedFn } from "ahooks";

export type ArrowConnectPointData = {
  element: BoardElement,
  connectPoints: Array<{
    connectId: string,
    point: Point
  }>
}

export type CandidateConnectPointData = {
  elementId: string;
  connectId: string;
  distance: number;
  point: Point;
}

export const useMoveArrow = ({
  isMoved,
  currentPoint,
}: {
  isMoved: MutableRefObject<boolean>,
  currentPoint: MutableRefObject<Point | null>,
}) => {
  const closingConnectElements = useRef<ArrowConnectPointData[]>([]);
  const candidateConnectPoints = useRef<CandidateConnectPointData[]>([]);

  const board = useBoard();

  const getUpdateArrowElement = useMemoizedFn((originalArrow: ArrowElement, currentPoint: Point, movedPointIndex: number) => {
    if (!isMoved.current) return originalArrow;
    const { points, source, target } = originalArrow;
    if (points.length <= movedPointIndex) return originalArrow;
    const newPoints = [...points];
    const newSource = { ...source };
    const newTarget = { ...target };
    // 没有候选或者不是第一个和最后一个
    if (candidateConnectPoints.current.length === 0) {
      newPoints[movedPointIndex] = currentPoint;
      if (movedPointIndex === 0 && source.bindId) {
        newSource.bindId = undefined;
        newSource.connectId = undefined;
      } else if (movedPointIndex === points.length - 1 && target.bindId) {
        newTarget.bindId = undefined;
        newTarget.connectId = undefined;
      }
      board.emit('arrow:drop', {
        elementId: '',
        connectId: ''
      })
    } else {
      const candidateConnectPoint = candidateConnectPoints.current[0];
      const { elementId, connectId, point } = candidateConnectPoint;
      if (movedPointIndex === 0) {
        newSource.bindId = elementId;
        newSource.connectId = connectId;
        newPoints[0] = point;
        board.emit('arrow:drop', {
          elementId,
          connectId
        })
      } else if (movedPointIndex === points.length - 1) {
        newTarget.bindId = elementId;
        newTarget.connectId = connectId;
        newPoints[points.length - 1] = point;
        board.emit('arrow:drop', {
          elementId,
          connectId
        })
      } else {
        newPoints[movedPointIndex] = currentPoint;
        board.emit('arrow:drop', {
          elementId: '',
          connectId: ''
        })
      }
    }

    return {
      ...originalArrow,
      points: newPoints,
      source: newSource,
      target: newTarget
    }
  })

  useEffect(() => {
    const handleAddClosingElements = (data: ArrowConnectPointData) => {
      if (!isMoved.current) return;

      const { zoom } = board.viewPort;
      const { element } = data;

      // 如果 closingConnectPoints 中已经存在该 elementId，则替换
      const index = closingConnectElements.current.findIndex(item => item.element.id === element.id);
      if (index > -1) {
        closingConnectElements.current[index] = data;
      } else {
        closingConnectElements.current.push(data);
      }

      candidateConnectPoints.current = closingConnectElements.current.map(item => {
        const { element, connectPoints } = item;
        
        return connectPoints.map(connectPoint => {
          if (!currentPoint.current) {
            return;
          }
          const distance = Math.hypot(currentPoint.current.x - connectPoint.point.x, currentPoint.current.y - connectPoint.point.y);
          
          if (distance >= 5 / zoom) return;

          return {
            elementId: element.id,
            connectId: connectPoint.connectId,
            distance,
            point: connectPoint.point
          }
        }).filter(isValid)
      }).flat().sort((a, b) => a.distance - b.distance);
    }

    const handleRemoveClosingElements = (data: ArrowConnectPointData) => {
      if (!isMoved.current) return;
      const { element } = data;
      const index = closingConnectElements.current.findIndex(item => item.element.id === element.id);
      if (index > -1) {
        closingConnectElements.current.splice(index, 1);
        candidateConnectPoints.current = candidateConnectPoints.current.filter(item => item.elementId !== element.id);
      }
    }

    const handleArrowMoveEnd = () => {
      candidateConnectPoints.current = [];
      closingConnectElements.current = [];
    }

    board.on('arrow:add-closing-elements', handleAddClosingElements);
    board.on('arrow:remove-closing-elements', handleRemoveClosingElements);
    board.on('arrow:move-end', handleArrowMoveEnd);

    return () => {
      board.off('arrow:add-closing-elements', handleAddClosingElements);
      board.off('arrow:remove-closing-elements', handleRemoveClosingElements);
      board.off('arrow:move-end', handleArrowMoveEnd);
    }
  }, [])

  return {
    candidateConnectPoints,
    getUpdateArrowElement
  }
}

export default useMoveArrow;