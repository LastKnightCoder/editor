import { useContext } from "react";
import { BoardStateContext } from "../context";

export const useBoardState = () => {
  const boardState = useContext(BoardStateContext);
  return boardState;
};
