import { useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { BoardContext, StaticSelectionContext } from "../context";
import type Board from "../Board";
import type { Selection } from "../types";

/** 按选区引用缓存的选中 id 集合：选区通知时每元素 O(1) 取布尔快照 */
const selectedIdsCache = new WeakMap<Selection, ReadonlySet<string>>();
const selectedIdsOf = (board: Board): ReadonlySet<string> => {
  const selection = board.selection;
  let ids = selectedIdsCache.get(selection);
  if (!ids) {
    ids = new Set(selection.selectedElements.map(element => element.id));
    selectedIdsCache.set(selection, ids);
  }
  return ids;
};

/**
 * 单元素的选中态订阅。不读 SelectionContext——那会让任何选区变化穿透 memo
 * 重渲整棵元素树；这里按元素 id 订阅 selection:change，并在通知侧先比较布尔值，
 * 选中态未翻转的元素不通知 React（点选/框选的渲染成本从全树降到翻转的元素）。
 */
export const useSelectState = (elementId: string) => {
  const board = useContext(BoardContext);
  const isolated = useContext(StaticSelectionContext);

  // 原生 useSyncExternalStore 每次 store 通知都会重渲订阅组件（无值比较短路），
  // 这里在监听器里先行比较：值未翻转不触发 listener，React 对未调度的组件零开销。
  const isSelectedRef = useRef(false);
  const isSelectingRef = useRef(false);

  const subscribeIsSelected = useCallback(
    (listener: () => void) => {
      if (!board) return () => {};
      const wrapped = () => {
        const next = !isolated && selectedIdsOf(board).has(elementId);
        if (next === isSelectedRef.current) return;
        isSelectedRef.current = next;
        listener();
      };
      board.on("selection:change", wrapped);
      return () => {
        board.off("selection:change", wrapped);
      };
    },
    [board, elementId, isolated]
  );
  const isSelected = useSyncExternalStore(
    subscribeIsSelected,
    () => (board ? !isolated && selectedIdsOf(board).has(elementId) : false),
    () => false
  );
  isSelectedRef.current = isSelected;

  const subscribeIsSelecting = useCallback(
    (listener: () => void) => {
      if (!board) return () => {};
      const wrapped = () => {
        const next = !isolated && Boolean(board.selection.selectArea);
        if (next === isSelectingRef.current) return;
        isSelectingRef.current = next;
        listener();
      };
      board.on("selection:change", wrapped);
      return () => {
        board.off("selection:change", wrapped);
      };
    },
    [board, isolated]
  );
  const isSelecting = useSyncExternalStore(
    subscribeIsSelecting,
    () => Boolean(board && !isolated && board.selection.selectArea),
    () => false
  );
  isSelectingRef.current = isSelecting;

  return {
    isSelected,
    isSelecting,
  };
};

export default useSelectState;
