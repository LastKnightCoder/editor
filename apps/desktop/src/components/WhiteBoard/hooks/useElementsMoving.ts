import { useEffect, useState } from "react";
import { Board, BoardElement } from "../types";

export const useElementsMoving = (board: Board) => {
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    const onMovingChange = (movingElements: BoardElement[]) => {
      setIsMoving(movingElements.length > 0);
    };
    const onMovingEnd = () => {
      setIsMoving(false);
    };
    board.on("element:move", onMovingChange);
    board.on("element:move-end", onMovingEnd);

    return () => {
      board.off("element:move", onMovingChange);
      board.off("element:move-end", onMovingEnd);
    };
  }, [board]);

  return isMoving;
};
