import { useEffect, useRef, MutableRefObject } from "react";
import { ArrowElement, BoardElement, CustomOffset, Point } from "../types";
import { useBoard } from "./useBoard";
import { isValid, getCustomConnectCandidate } from "../utils";
import { ARROW_CONNECT_ID } from "../constants";
import { useMemoizedFn } from "ahooks";

export type ArrowConnectPointData = {
  element: BoardElement;
  connectPoints: Array<{
    connectId: string;
    point: Point;
  }>;
};

export type CandidateConnectPointData = {
  elementId: string;
  connectId: string;
  distance: number;
  point: Point;
  customOffset?: CustomOffset;
};

export const useMoveArrow = ({
  isMoved,
  currentPoint,
}: {
  isMoved: MutableRefObject<boolean | null>;
  currentPoint: MutableRefObject<Point | null>;
}) => {
  const closingConnectElements = useRef<ArrowConnectPointData[]>([]);
  const candidateConnectPoints = useRef<CandidateConnectPointData[]>([]);
  // alt 模式：按住 alt 拖拽时启用自定义连接点吸附（射线-边缘交点）
  const altKeyRef = useRef(false);

  const board = useBoard();

  const setAltMode = useMemoizedFn((alt: boolean) => {
    altKeyRef.current = alt;
  });

  const emitCustomSnap = useMemoizedFn(() => {
    const top = candidateConnectPoints.current[0];
    if (top && top.connectId === ARROW_CONNECT_ID.CUSTOM) {
      board.emit("arrow:custom-snap", { point: top.point });
    } else {
      board.emit("arrow:custom-snap", null);
    }
  });

  const getUpdateArrowElement = useMemoizedFn(
    (originalArrow: ArrowElement, currentPoint: Point, movedPointIndex: number) => {
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
          newSource.customOffset = undefined;
        } else if (movedPointIndex === points.length - 1 && target.bindId) {
          newTarget.bindId = undefined;
          newTarget.connectId = undefined;
          newTarget.customOffset = undefined;
        }
        board.emit("arrow:drop", {
          elementId: "",
          connectId: "",
        });
      } else {
        const candidateConnectPoint = candidateConnectPoints.current[0];
        const { elementId, connectId, point, customOffset } = candidateConnectPoint;
        if (movedPointIndex === 0) {
          newSource.bindId = elementId;
          newSource.connectId = connectId;
          newSource.customOffset = customOffset;
          newPoints[0] = point;
          board.emit("arrow:drop", {
            elementId,
            connectId,
          });
        } else if (movedPointIndex === points.length - 1) {
          newTarget.bindId = elementId;
          newTarget.connectId = connectId;
          newTarget.customOffset = customOffset;
          newPoints[points.length - 1] = point;
          board.emit("arrow:drop", {
            elementId,
            connectId,
          });
        } else {
          newPoints[movedPointIndex] = currentPoint;
          board.emit("arrow:drop", {
            elementId: "",
            connectId: "",
          });
        }
      }

      return {
        ...originalArrow,
        points: newPoints,
        source: newSource,
        target: newTarget,
      };
    }
  );

  useEffect(() => {
    const recomputeCandidates = () => {
      const { zoom } = board.viewPort;
      const mouse = currentPoint.current;

      // alt 模式：忽略 5 个固定点，按"中心→鼠标"射线与 bbox 边缘交点生成唯一候选
      if (altKeyRef.current && mouse) {
        candidateConnectPoints.current = closingConnectElements.current
          .map(item => {
            const candidate = getCustomConnectCandidate(
              item.element as BoardElement & {
                x: number;
                y: number;
                width: number;
                height: number;
              },
              mouse,
              zoom
            );
            if (!candidate) return null;
            return {
              elementId: item.element.id,
              connectId: ARROW_CONNECT_ID.CUSTOM,
              distance: candidate.distance,
              point: candidate.point,
              customOffset: candidate.customOffset,
            };
          })
          .filter(isValid)
          .sort((a, b) => a.distance - b.distance);
        emitCustomSnap();
        return;
      }

      // 非 alt 模式：清除自定义吸附可视化，沿用 5 点距离吸附
      board.emit("arrow:custom-snap", null);
      candidateConnectPoints.current = closingConnectElements.current
        .map(item => {
          const { element, connectPoints } = item;

          return connectPoints
            .map(connectPoint => {
              if (!currentPoint.current) {
                return;
              }
              const distance = Math.hypot(
                currentPoint.current.x - connectPoint.point.x,
                currentPoint.current.y - connectPoint.point.y
              );

              if (distance >= 5 / zoom) return;

              return {
                elementId: element.id,
                connectId: connectPoint.connectId,
                distance,
                point: connectPoint.point,
              };
            })
            .filter(isValid);
        })
        .flat()
        .sort((a, b) => a.distance - b.distance);
    };

    const handleAddClosingElements = (data: ArrowConnectPointData) => {
      if (!isMoved.current) return;

      const { element } = data;

      // 如果 closingConnectPoints 中已经存在该 elementId，则替换
      const index = closingConnectElements.current.findIndex(
        item => item.element.id === element.id
      );
      if (index > -1) {
        closingConnectElements.current[index] = data;
      } else {
        closingConnectElements.current.push(data);
      }

      recomputeCandidates();
    };

    const handleRemoveClosingElements = (data: ArrowConnectPointData) => {
      if (!isMoved.current) return;
      const { element } = data;
      const index = closingConnectElements.current.findIndex(
        item => item.element.id === element.id
      );
      if (index > -1) {
        closingConnectElements.current.splice(index, 1);
        recomputeCandidates();
      }
    };

    const handleArrowMoveEnd = () => {
      candidateConnectPoints.current = [];
      closingConnectElements.current = [];
      altKeyRef.current = false;
      board.emit("arrow:custom-snap", null);
    };

    board.on("arrow:add-closing-elements", handleAddClosingElements);
    board.on("arrow:remove-closing-elements", handleRemoveClosingElements);
    board.on("arrow:move-end", handleArrowMoveEnd);

    return () => {
      board.off("arrow:add-closing-elements", handleAddClosingElements);
      board.off("arrow:remove-closing-elements", handleRemoveClosingElements);
      board.off("arrow:move-end", handleArrowMoveEnd);
    };
  }, [board, currentPoint, emitCustomSnap]);

  return {
    candidateConnectPoints,
    getUpdateArrowElement,
    setAltMode,
  };
};

export default useMoveArrow;
