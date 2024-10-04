import { useEffect, useRef, useState } from "react";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import { WhiteBoard } from "@/types";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { BoardElement, ViewPort, Selection } from "@/components/WhiteBoard";

const useEditWhiteBoard = (whiteBoardId: number) => {
  const [whiteBoard, setWhiteBoard] = useState<WhiteBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const changed = useRef(false);
  const { whiteBoards, updateWhiteBoard } = useWhiteBoardStore(state => ({
    whiteBoards: state.whiteBoards,
    updateWhiteBoard: state.updateWhiteBoard,
  }));

  useEffect(() => {
    setLoading(true);
    const whiteBoard = whiteBoards.find(wb => wb.id === whiteBoardId);
    if (whiteBoard) {
      setWhiteBoard(whiteBoard);
    }
    setLoading(false);
  }, [whiteBoardId, whiteBoards]);

  const onChange = useMemoizedFn((data: { children: BoardElement[], viewPort: ViewPort, selection: Selection }) => {
    if (!whiteBoard) return;
    const newWhiteBoard = produce(whiteBoard, (draft) => {
      draft.data = data;
    });
    setWhiteBoard(newWhiteBoard);
    changed.current = true;
  });

  const saveWhiteBoard = useMemoizedFn(async () => {
    if (!whiteBoard || !changed.current) return;
    const newWhiteBoard = await updateWhiteBoard(whiteBoard);
    setWhiteBoard(newWhiteBoard);
    changed.current = false;
  });

  return {
    whiteBoard,
    loading,
    onChange,
    saveWhiteBoard,
  }
}

export default useEditWhiteBoard;