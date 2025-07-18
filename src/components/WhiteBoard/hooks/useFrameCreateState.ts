import { useEffect, useState } from "react";
import { useBoard } from "./useBoard";

export const useFrameCreateState = () => {
  const board = useBoard();
  const [isFrameCreating, setIsFrameCreating] = useState(false);

  useEffect(() => {
    const handleFrameCreateStart = () => {
      setIsFrameCreating(true);
    };

    const handleFrameCreateEnd = () => {
      setIsFrameCreating(false);
    };

    board.on("frame-create:start", handleFrameCreateStart);
    board.on("frame-create:end", handleFrameCreateEnd);

    return () => {
      board.off("frame-create:start", handleFrameCreateStart);
      board.off("frame-create:end", handleFrameCreateEnd);
    };
  }, []);

  return { isFrameCreating };
};
