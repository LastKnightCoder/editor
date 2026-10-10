import { useEffect } from "react";
import { useBoard } from "./useBoard";

/** 元素可能因视口裁剪或页面停驻而卸载，不能只靠 blur 释放编辑标记。 */
export function useEditingElementCleanup(elementId: string) {
  const board = useBoard();
  useEffect(
    () => () => {
      board.isEditingElements = board.isEditingElements.filter(id => id !== elementId);
    },
    [board, elementId]
  );
}
