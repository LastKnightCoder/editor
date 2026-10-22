import { useCallback, useEffect, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { Range, type Editor as SlateEditor } from "slate";
import { ReactEditor } from "slate-react";

/** 选区展开后需稳定这么久才对外更新：Android 长按选词时选区会连续变化多次 */
export const READING_SELECTION_SETTLE_MS = 150;

export type ReadingSelectionState = {
  /** 编辑器内非折叠的选区；阅读态以外恒为 null */
  range: Range | null;
  /** 清空 DOM 选区并置空 range */
  clear: () => void;
};

/** 编辑器根节点内的非折叠 DOM 选区换算成 Slate Range；其余情况返回 null */
function readEditorRange(editorRef: RefObject<EditorRef | null>): Range | null {
  const root = editorRef.current?.getEditableElement();
  const editor = editorRef.current?.getEditor() as SlateEditor | undefined;
  const domSelection = typeof window === "undefined" ? null : window.getSelection();
  if (!root || !editor || !domSelection || domSelection.rangeCount === 0) return null;
  if (domSelection.isCollapsed) return null;
  const { anchorNode, focusNode } = domSelection;
  if (!anchorNode || !focusNode || !root.contains(anchorNode) || !root.contains(focusNode)) {
    return null;
  }
  const range = ReactEditor.toSlateRange(editor as ReactEditor, domSelection, {
    exactMatch: false,
    suppressThrow: true,
  });
  return range && !Range.isCollapsed(range) ? range : null;
}

/**
 * 阅读态选区：slate-react 只读时不把 DOM 选区同步进 editor.selection，
 * 由宿主监听 selectionchange 自行换算。展开选区防抖后更新，折叠或移出编辑器立即置空。
 */
export function useReadingSelection(
  editorRef: RefObject<EditorRef | null>,
  active: boolean
): ReadingSelectionState {
  const [range, setRange] = useState<Range | null>(null);

  const updateRange = useCallback((next: Range | null) => {
    setRange(prev => {
      if (prev === next) return prev;
      if (prev && next && Range.equals(prev, next)) return prev;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!active) {
      setRange(null);
      return;
    }
    let frame: number | null = null;
    let settleTimer: number | null = null;
    const clearSettleTimer = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = null;
    };
    const handleFrame = () => {
      frame = null;
      clearSettleTimer();
      if (!readEditorRange(editorRef)) {
        updateRange(null);
        return;
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        updateRange(readEditorRange(editorRef));
      }, READING_SELECTION_SETTLE_MS);
    };
    const handleSelectionChange = () => {
      if (frame === null) frame = window.requestAnimationFrame(handleFrame);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (frame !== null) window.cancelAnimationFrame(frame);
      clearSettleTimer();
    };
  }, [active, editorRef, updateRange]);

  const clear = useCallback(() => {
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
    setRange(null);
  }, []);

  return { range: active ? range : null, clear };
}

export default useReadingSelection;
