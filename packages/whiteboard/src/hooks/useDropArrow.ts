import { useMemoizedFn } from "ahooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { ARROW_CONNECT_ID, ARROW_DROP_PROXIMITY_RADIUS } from "../constants";
import { CommonPlugin, type CommonElement } from "../plugins/CommonPlugin";
import { Point } from "../types";
import { resolveConnectPointOwner } from "../utils/ConnectPointOwner";
import { useBoard } from "./useBoard";
import { useBoardState } from "./useBoardState";

interface DropArrowOptions {
  /**
   * 容器元素（如 Frame）：内部空白让给子元素，仅靠近边框时成为连接目标；
   * 不提供居中连接点——中心位于内部空白区，按此规则无法到达且常被子元素覆盖
   */
  container?: boolean;
}

/** 注册元素为箭头连接目标（悬停连接点与拖动落点共用一份候选），并在拖动箭头时判定自己是否为落点 */
export const useDropArrow = (
  element: CommonElement & any,
  { container = false }: DropArrowOptions = {}
) => {
  const { x, y, width, height, id } = element;

  const [isMoveArrowClosing, setIsMoveArrowClosing] = useState(false);
  const [activeConnectId, setActiveConnectId] = useState("");
  const board = useBoard();
  const { connectPointOwnerStore } = useBoardState();
  const wasClosingRef = useRef(false);

  const [arrowConnectPoints, arrowConnectExtendPoints] = useMemo(() => {
    const withoutCenterIfContainer = <T extends { connectId: string }>(points: T[]) =>
      container ? points.filter(({ connectId }) => connectId !== ARROW_CONNECT_ID.CENTER) : points;
    return [
      withoutCenterIfContainer(CommonPlugin.getArrowConnectPoints(element)),
      withoutCenterIfContainer(CommonPlugin.getArrowConnectExtendPoints(element)),
    ];
  }, [container, element]);

  useEffect(() => {
    if (!connectPointOwnerStore) return;
    return connectPointOwnerStore.register(id, {
      bounds: { x, y, width, height },
      container,
    });
  }, [connectPointOwnerStore, container, height, id, width, x, y]);

  const handleArrowMove = useMemoizedFn((data: { currentPoint: Point }) => {
    const { currentPoint } = data;
    const ownerId = connectPointOwnerStore
      ? connectPointOwnerStore.resolveAt(currentPoint, ARROW_DROP_PROXIMITY_RADIUS)
      : resolveConnectPointOwner(
          [[id, { bounds: { x, y, width, height }, container }]],
          currentPoint,
          ARROW_DROP_PROXIMITY_RADIUS
        );
    const isDropTarget = ownerId === id;
    const wasClosing = wasClosingRef.current;
    wasClosingRef.current = isDropTarget;
    setIsMoveArrowClosing(isDropTarget);
    if (isDropTarget) {
      board.emit("arrow:add-closing-elements", {
        element,
        connectPoints: arrowConnectPoints,
      });
    } else if (wasClosing) {
      board.emit("arrow:remove-closing-elements", {
        element,
        connectPoints: arrowConnectPoints,
      });
      setActiveConnectId("");
    }
  });

  const handleArrowMoveEnd = useMemoizedFn(() => {
    wasClosingRef.current = false;
    setIsMoveArrowClosing(false);
    setActiveConnectId("");
  });

  const handleArrowDroped = useMemoizedFn(
    ({ elementId, connectId }: { elementId: string; connectId: string }) => {
      if (!isMoveArrowClosing || id !== elementId) {
        setActiveConnectId("");
        return;
      }
      setActiveConnectId(connectId);
    }
  );

  useEffect(() => {
    board.on("arrow:update", handleArrowMove);
    board.on("arrow:move-end", handleArrowMoveEnd);
    board.on("arrow:drop", handleArrowDroped);

    return () => {
      board.off("arrow:update", handleArrowMove);
      board.off("arrow:move-end", handleArrowMoveEnd);
      board.off("arrow:drop", handleArrowDroped);
    };
  }, [handleArrowMove, handleArrowMoveEnd, handleArrowDroped, board]);

  return {
    isMoveArrowClosing,
    activeConnectId,
    arrowConnectPoints,
    arrowConnectExtendPoints,
  };
};
