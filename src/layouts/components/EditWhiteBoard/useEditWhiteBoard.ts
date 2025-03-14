import { useEffect, useRef, useState } from "react";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import { WhiteBoard } from "@/types";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { BoardElement, ViewPort, Selection } from "@/components/WhiteBoard";
import { getWhiteBoardById } from "@/commands";
const useEditWhiteBoard = (whiteBoardId: number) => {
  const [whiteBoard, setWhiteBoard] = useState<WhiteBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const changed = useRef(false);
  const { updateWhiteBoard } = useWhiteBoardStore((state) => ({
    updateWhiteBoard: state.updateWhiteBoard,
  }));

  useEffect(() => {
    setLoading(true);
    getWhiteBoardById(whiteBoardId)
      .then((wb) => {
        setWhiteBoard(wb);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [whiteBoardId]);

  const onChange = useMemoizedFn(
    (data: {
      children: BoardElement[];
      viewPort: ViewPort;
      selection: Selection;
    }) => {
      if (!whiteBoard) return;
      const newWhiteBoard = produce(whiteBoard, (draft) => {
        draft.data = data;
      });
      setWhiteBoard(newWhiteBoard);
      changed.current = true;
    },
  );

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
  };
};

export default useEditWhiteBoard;
