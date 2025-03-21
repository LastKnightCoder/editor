import { useContext } from "react";
import { BoardContext } from "../context";

export const useBoard = () => {
  const board = useContext(BoardContext);
  if (!board) {
    throw new Error("useBoard must be used within a BoardProvider");
  }

  return board;
};
