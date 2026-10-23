import { useCallback, useEffect, useState } from "react";
import { toast } from "../../../components/toast";
import type { ReadingModeState } from "../readingMode/useReadingMode";
import type { BlockSelectionState } from "../blockSelection/useBlockSelection";

type UseOutlineSheetOptions = {
  readingMode: Pick<ReadingModeState, "editing" | "canEdit" | "exitEditing">;
  blockSelection: Pick<BlockSelectionState, "active" | "exit">;
};

/** 「整理结构」Sheet 的开关：打开前退出块选择、编辑态先收键盘；不可编辑时提示且打开中的立即关闭 */
export function useOutlineSheet(options: UseOutlineSheetOptions) {
  const { readingMode, blockSelection } = options;
  const [open, setOpen] = useState(false);

  const openOutline = () => {
    if (!readingMode.canEdit) {
      toast({ type: "warning", text: "当前内容不可编辑" });
      return;
    }
    if (blockSelection.active) blockSelection.exit();
    if (readingMode.editing) readingMode.exitEditing();
    setOpen(true);
  };

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!readingMode.canEdit) setOpen(false);
  }, [readingMode.canEdit]);

  return { open, openOutline, close };
}
