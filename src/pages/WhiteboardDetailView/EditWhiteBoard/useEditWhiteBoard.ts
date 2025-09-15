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
    // 更新 whiteboar.whiteBoardContentList
    const newWhiteBoard = produce(whiteBoard, (draft) => {
      const index = draft.whiteBoardContentList.findIndex(
        (item) => item.id === activeSubWhiteBoard.id,
      );
      if (index === -1) {
        draft.whiteBoardContentList.push(newSubWhiteBoard);
      } else {
        draft.whiteBoardContentList[index] = newSubWhiteBoard;
      }
    });
    setWhiteBoard(newWhiteBoard);
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

  const onUpdateSubWhiteBoardName = useMemoizedFn(
    async (id: number, name: string) => {
      if (!whiteBoard) return;

      // 先保存当前的白板
      await saveSubWhiteBoard();

      // 找到要更新的白板
      const targetWhiteBoard = whiteBoard.whiteBoardContentList.find(
        (item) => item.id === id,
      );

      if (!targetWhiteBoard) return;

      // 更新名称
      const updatedWhiteBoard = await updateSubWhiteBoard(
        id,
        name,
        targetWhiteBoard.data,
      );

      // 如果当前活动的白板就是被修改的白板，更新活动白板
      if (activeSubWhiteBoard && activeSubWhiteBoard.id === id) {
        setActiveSubWhiteBoard(updatedWhiteBoard);
      }

      // 刷新白板列表
      const newWhiteBoard = await getWhiteBoardById(whiteBoardId);
      setWhiteBoard(newWhiteBoard);
    },
  );

  return {
    whiteBoard,
    activeSubWhiteBoard,
    loading,
    onSubWhiteBoardContentChange,
    saveSubWhiteBoard,
    onAddSubWhiteBoard,
    onDeleteSubWhiteBoard,
    changeSubWhiteBoard,
    onUpdateSubWhiteBoardName,
  };
};

export default useEditWhiteBoard;
