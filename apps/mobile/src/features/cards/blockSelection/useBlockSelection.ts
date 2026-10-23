import { useCallback, useEffect, useState } from "react";
import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import { normalizeBlockIndices } from "./blockOps";

type UseBlockSelectionOptions = {
  /** 当前顶层块数量（editor.children.length），越界的选中下标自动裁剪 */
  blockCount: number;
  /** 当前处于编辑态 */
  editing: boolean;
  /** 收键盘、回阅读态（阅读态 hook 的 exitEditing） */
  exitEditing: () => void;
  /** 不可编辑（协作只读等）：激活中立即退出，且不可进入 */
  disabled?: boolean;
};

export type BlockSelectionState = {
  active: boolean;
  /** 升序的选中顶层块下标 */
  selected: number[];
  /** 进入块选择并选中 index；不传时选中 0 个（从菜单入口进入，再点块选择） */
  enter: (index?: number) => void;
  exit: () => void;
  toggle: (index: number) => void;
  selectAll: () => void;
  setSelected: (indices: number[]) => void;
};

/** 块选择模式：只作用于顶层块；激活期间系统返回 = 退出 */
export function useBlockSelection(options: UseBlockSelectionOptions): BlockSelectionState {
  const { blockCount, editing, exitEditing, disabled = false } = options;
  const [active, setActive] = useState(false);
  const [selected, setSelectedState] = useState<number[]>([]);

  const enter = useCallback(
    (index?: number) => {
      if (disabled) return;
      if (editing) exitEditing();
      setActive(true);
      setSelectedState(index === undefined ? [] : normalizeBlockIndices([index], blockCount));
    },
    [blockCount, disabled, editing, exitEditing]
  );

  const exit = useCallback(() => {
    setActive(false);
    setSelectedState([]);
  }, []);

  const toggle = useCallback(
    (index: number) => {
      setSelectedState(prev =>
        prev.includes(index)
          ? prev.filter(item => item !== index)
          : normalizeBlockIndices([...prev, index], blockCount)
      );
    },
    [blockCount]
  );

  const selectAll = useCallback(() => {
    setSelectedState(Array.from({ length: blockCount }, (_, index) => index));
  }, [blockCount]);

  const setSelected = useCallback(
    (indices: number[]) => setSelectedState(normalizeBlockIndices(indices, blockCount)),
    [blockCount]
  );

  useEffect(() => {
    setSelectedState(prev => {
      const next = normalizeBlockIndices(prev, blockCount);
      return next.length === prev.length ? prev : next;
    });
  }, [blockCount]);

  useEffect(() => {
    if (disabled && active) exit();
  }, [active, disabled, exit]);

  useSheetBackDismiss(active, exit);

  return { active, selected, enter, exit, toggle, selectAll, setSelected };
}

export default useBlockSelection;
