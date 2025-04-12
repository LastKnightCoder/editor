import { useEffect, useRef, useState } from "react";
import { WhiteBoard, WhiteBoardContent } from "@/types";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import {
  BoardElement,
  ViewPort,
  Selection,
  PresentationSequence,
} from "@/components/WhiteBoard";
import {
  getWhiteBoardById,
  deleteSubWhiteBoard,
  addSubWhiteBoard,
  updateSubWhiteBoard,
} from "@/commands";

const useEditWhiteBoard = (whiteBoardId: number) => {
  const [whiteBoard, setWhiteBoard] = useState<WhiteBoard | null>(null);
  const [activeSubWhiteBoard, setActiveSubWhiteBoard] =
    useState<WhiteBoardContent | null>(null);
  const [loading, setLoading] = useState(false);
  const changed = useRef(false);

  useEffect(() => {
    setLoading(true);
    getWhiteBoardById(whiteBoardId)
      .then((wb) => {
        setWhiteBoard(wb);
        console.log(wb.whiteBoardContentList);
        if (wb.whiteBoardContentList.length > 0) {
          setActiveSubWhiteBoard(wb.whiteBoardContentList[0]);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [whiteBoardId]);

  const onSubWhiteBoardContentChange = useMemoizedFn(
    (data: {
      children: BoardElement[];
      viewPort: ViewPort;
      selection: Selection;
      presentationSequences?: PresentationSequence[];
    }) => {
      if (!whiteBoard || !activeSubWhiteBoard) return;
      const newSubWhiteBoard = produce(activeSubWhiteBoard, (draft) => {
        draft.data = data;
      });
      setActiveSubWhiteBoard(newSubWhiteBoard);
      changed.current = true;
    },
  );

  const changeSubWhiteBoard = useMemoizedFn(
    async (subWhiteBoard: WhiteBoardContent) => {
      // 保存当前白板
      await saveSubWhiteBoard();
      // 切换到新白板
      setActiveSubWhiteBoard(subWhiteBoard);
    },
  );

  const saveSubWhiteBoard = useMemoizedFn(async () => {
    if (!whiteBoard || !changed.current || !activeSubWhiteBoard) return;
    const newSubWhiteBoard = await updateSubWhiteBoard(
      activeSubWhiteBoard.id,
      activeSubWhiteBoard.name,
      activeSubWhiteBoard.data,
    );
    setActiveSubWhiteBoard(newSubWhiteBoard);
    changed.current = false;
  });

  const onAddSubWhiteBoard = useMemoizedFn(
    async (name: string, data: WhiteBoardContent["data"]) => {
      if (!whiteBoard) return;
      const newSubWhiteBoard = await addSubWhiteBoard(
        whiteBoard.id,
        name,
        data,
      );
      setActiveSubWhiteBoard(newSubWhiteBoard);
      const newWhiteBoard = await getWhiteBoardById(whiteBoardId);
      setWhiteBoard(newWhiteBoard);
    },
  );

  const onDeleteSubWhiteBoard = useMemoizedFn(async (id: number) => {
    if (!whiteBoard) return;
    const currentIndex = whiteBoard.whiteBoardContentList.findIndex(
      (item) => item.id === id,
    );
    if (currentIndex === -1) return;
    await deleteSubWhiteBoard(whiteBoard.id, id);
    if (id === activeSubWhiteBoard?.id) {
      if (currentIndex === whiteBoard.whiteBoardContentList.length - 1) {
        setActiveSubWhiteBoard(
          whiteBoard.whiteBoardContentList[currentIndex - 1],
        );
      } else {
        setActiveSubWhiteBoard(
          whiteBoard.whiteBoardContentList[currentIndex + 1],
        );
      }
    }
    const newWhiteBoard = await getWhiteBoardById(whiteBoardId);
    setWhiteBoard(newWhiteBoard);
  });

  return {
    whiteBoard,
    activeSubWhiteBoard,
    loading,
    onSubWhiteBoardContentChange,
    saveSubWhiteBoard,
    onAddSubWhiteBoard,
    onDeleteSubWhiteBoard,
    changeSubWhiteBoard,
  };
};

export default useEditWhiteBoard;
