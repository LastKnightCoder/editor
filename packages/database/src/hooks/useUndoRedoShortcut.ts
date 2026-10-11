import { useEffect, type RefObject } from "react";
import { isEditableTarget } from "@tau/ui";
import { useMemoizedFn } from "ahooks";

export interface UndoRedoShortcutOptions {
  /** 返回 false 时让位（readonly、正在编辑单元格等），由调用方按实例状态决定 */
  enabled: () => boolean;
  /** 限定事件目标所在实例；目标不在根节点内时不处理 */
  scope?: RefObject<HTMLElement | null>;
}

/** Cmd/Ctrl+Z 撤销、Shift+Cmd/Ctrl+Z 与 Ctrl+Y 重做；让位输入框、输入法组合与实例外目标。 */
export const useUndoRedoShortcut = (
  onUndo: () => void,
  onRedo: () => void,
  { enabled, scope }: UndoRedoShortcutOptions
) => {
  const handleKeyDown = useMemoizedFn((e: KeyboardEvent) => {
    if (
      e.defaultPrevented ||
      e.isComposing ||
      e.altKey ||
      isEditableTarget(e.target) ||
      !enabled() ||
      (scope && (!(e.target instanceof Node) || !scope.current?.contains(e.target)))
    ) {
      return;
    }
    const key = e.key.toLowerCase();
    const undoIntent = (e.metaKey || e.ctrlKey) && !e.shiftKey && key === "z";
    const redoIntent =
      ((e.metaKey || e.ctrlKey) && e.shiftKey && key === "z") ||
      (e.ctrlKey && !e.metaKey && key === "y");
    if (!undoIntent && !redoIntent) return;
    e.preventDefault();
    if (undoIntent) onUndo();
    else onRedo();
  });

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
};

export default useUndoRedoShortcut;
