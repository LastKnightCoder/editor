import { useMemoizedFn } from "ahooks";
import { useEffect, useMemo, useState } from "react";
import { CommonElement, CommonPlugin } from "../plugins";
import { Point } from "../types";
import { useBoard } from "./useBoard";
import { useViewPort } from "./useViewPort";
export const useDropArrow = (element: CommonElement & any) => {
  const { x, y, width, height, id } = element;

  const [isMoveArrowClosing, setIsMoveArrowClosing] = useState(false);
  const [activeConnectId, setActiveConnectId] = useState("");
  const board = useBoard();
  const { zoom } = useViewPort();

  const [arrowConnectPoints, arrowConnectExtendPoints] = useMemo(() => {
    const arrowConnectPoints = CommonPlugin.getArrowConnectPoints(element);
    const arrowConnectExtendPoints =
      CommonPlugin.getArrowConnectExtendPoints(element);
    return [arrowConnectPoints, arrowConnectExtendPoints, zoom];
  }, [element]);

  const handleArrowMove = useMemoizedFn((data: { currentPoint: Point }) => {
    const extend = 10;
    const { currentPoint } = data;
    const extendBox = {
      x: x - extend,
      y: y - extend,
      width: width + 2 * extend,
      height: height + 2 * extend,
    };

    const isInBox =
      currentPoint.x >= extendBox.x &&
      currentPoint.x <= extendBox.x + extendBox.width &&
      currentPoint.y >= extendBox.y &&
      currentPoint.y <= extendBox.y + extendBox.height;
    setIsMoveArrowClosing(isInBox);
    if (isInBox) {
      board.emit("arrow:add-closing-elements", {
        element,
        connectPoints: arrowConnectPoints,
      });
    } else {
      board.emit("arrow:remove-closing-elements", {
        element,
        connectPoints: arrowConnectPoints,
      });
      setActiveConnectId("");
    }
  });

  const handleArrowMoveEnd = useMemoizedFn(() => {
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
    },
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
  }, [handleArrowMove, handleArrowMoveEnd, handleArrowDroped]);

  return {
    isMoveArrowClosing,
    activeConnectId,
    arrowConnectPoints,
    arrowConnectExtendPoints,
  };
};
