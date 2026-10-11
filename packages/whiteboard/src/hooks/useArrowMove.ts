import { createContext, useContext, useEffect, useState } from "react";
import Board from "../Board";

export const ArrowMoveContext = createContext<{
  isMoving: boolean;
}>({
  isMoving: false,
});

export const useArrowMove = () => {
  const { isMoving } = useContext(ArrowMoveContext);
  return isMoving;
};

export const useListenArrowMove = (board: Board) => {
  const [isMoving, setIsMoving] = useState(false);

  const handleArrowMove = () => {
    setIsMoving(true);
  };

  const handleArrowMoveEnd = () => {
    setIsMoving(false);
  };

  useEffect(() => {
    board.on("tau.arrow.update", handleArrowMove);
    board.on("tau.arrow.move-end", handleArrowMoveEnd);

    return () => {
      board.off("tau.arrow.update", handleArrowMove);
      board.off("tau.arrow.move-end", handleArrowMoveEnd);
    };
  }, [board]);

  return isMoving;
};
