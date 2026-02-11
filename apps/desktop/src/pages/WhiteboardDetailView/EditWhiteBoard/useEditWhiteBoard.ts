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
  setActiveSubWhiteBoard as setActiveSubWhiteBoardCommand,
  reorderSubWhiteBoard,
} from "@/commands";

const resolveActiveSubWhiteBoard = (
  whiteBoard: WhiteBoard,
  preferredId?: number | null,
): WhiteBoardContent | null => {
  const targetId = preferredId ?? whiteBoard.activeWhiteBoardContentId;
  if (targetId !== null && targetId !== undefined) {
    const matched = whiteBoard.whiteBoardContentList.find(
      (item) => item.id === targetId,
    );
    if (matched) return matched;
  }
  return whiteBoard.whiteBoardContentList[0] ?? null;
};

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
        setActiveSubWhiteBoard(resolveActiveSubWhiteBoard(wb));
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
      if (!whiteBoard) return;
      // 保存当前白板
      await saveSubWhiteBoard();
      // 切换到新白板
      setActiveSubWhiteBoard(subWhiteBoard);
      const updatedWhiteBoard = await setActiveSubWhiteBoardCommand(
        whiteBoard.id,
        subWhiteBoard.id,
      );
      setWhiteBoard(updatedWhiteBoard);
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
    // 更新 whiteBoard.whiteBoardContentList
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
      const newWhiteBoard = await setActiveSubWhiteBoardCommand(
        whiteBoard.id,
        newSubWhiteBoard.id,
      );
      setWhiteBoard(newWhiteBoard);
      setActiveSubWhiteBoard(
        resolveActiveSubWhiteBoard(newWhiteBoard, newSubWhiteBoard.id),
      );
    },
  );

  const onDeleteSubWhiteBoard = useMemoizedFn(async (id: number) => {
    if (!whiteBoard) return;
    await saveSubWhiteBoard();
    await deleteSubWhiteBoard(whiteBoard.id, id);
    const newWhiteBoard = await getWhiteBoardById(whiteBoardId);
    setWhiteBoard(newWhiteBoard);
    setActiveSubWhiteBoard(resolveActiveSubWhiteBoard(newWhiteBoard));
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
      setActiveSubWhiteBoard(
        resolveActiveSubWhiteBoard(newWhiteBoard, activeSubWhiteBoard?.id),
      );
    },
  );

  const onReorderSubWhiteBoards = useMemoizedFn(
    async (orderedIds: number[]) => {
      if (!whiteBoard) return;
      await saveSubWhiteBoard();
      const newWhiteBoard = await reorderSubWhiteBoard(
        whiteBoard.id,
        orderedIds,
      );
      setWhiteBoard(newWhiteBoard);
      setActiveSubWhiteBoard(
        resolveActiveSubWhiteBoard(newWhiteBoard, activeSubWhiteBoard?.id),
      );
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
    onReorderSubWhiteBoards,
  };
};

export default useEditWhiteBoard;
