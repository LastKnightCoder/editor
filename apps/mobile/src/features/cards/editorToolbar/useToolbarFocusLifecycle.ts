import { useCallback, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { Editor as SlateEditor, type BaseSelection } from "slate";

import { getEditorFromRef } from "./useToolbarSelectionState";
import type { ClosePanelOptions, EditorPanelKind } from "./useMobileEditorToolbarController";

type ToolbarFocusLifecycleOptions = {
  editorRef: RefObject<EditorRef | null>;
  closePanel: (options: ClosePanelOptions) => void;
  dismissKeyboard: () => void;
  markSelectionDirty: () => void;
  restoreEditorSelection: () => SlateEditor | null;
  lastSelectionRef: RefObject<BaseSelection | null>;
  /** 与 useToolbarSelectionState 共享的同一 ref 实例，用于区分点正文与回键盘 */
  activePanelRef: RefObject<EditorPanelKind | null>;
};

/** 焦点生命周期域：编辑器焦点状态跟踪、退出编辑与宿主监听器（退出编辑/块选择）登记 */
export function useToolbarFocusLifecycle({
  editorRef,
  closePanel,
  dismissKeyboard,
  markSelectionDirty,
  restoreEditorSelection,
  lastSelectionRef,
  activePanelRef,
}: ToolbarFocusLifecycleOptions) {
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const exitEditingListenerRef = useRef<(() => void) | null>(null);
  const blockSelectionListenerRef = useRef<((index: number) => void) | null>(null);

  const keepEditorFocus = useCallback(() => {
    const editor = restoreEditorSelection();
    if (!editor) {
      return;
    }
    setIsEditorFocused(true);
    if (editor.selection) {
      lastSelectionRef.current = editor.selection;
    }
    markSelectionDirty();
  }, [markSelectionDirty, restoreEditorSelection]);

  const handleEditorFocus = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    // 面板打开时编辑器重新获得焦点 = 用户点了正文：选区由点击位置决定，只关面板；
    // 语音面板保持打开，点正文只移动语音插入点
    if (activePanelRef.current && activePanelRef.current !== "voice") {
      closePanel({ showKeyboard: false });
    }
    setIsEditorFocused(true);
    lastSelectionRef.current = editor.selection ?? null;
    markSelectionDirty();
  }, [closePanel, editorRef, markSelectionDirty]);

  const exitEditing = useCallback(() => {
    dismissKeyboard();
    exitEditingListenerRef.current?.();
  }, [dismissKeyboard]);

  const setExitEditingListener = useCallback((listener: (() => void) | null) => {
    exitEditingListenerRef.current = listener;
  }, []);

  const setBlockSelectionListener = useCallback((listener: ((index: number) => void) | null) => {
    blockSelectionListenerRef.current = listener;
  }, []);

  const requestBlockSelection = useCallback((index: number) => {
    const listener = blockSelectionListenerRef.current;
    if (!listener) return false;
    listener(index);
    return true;
  }, []);

  const handleEditorBlur = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    setIsEditorFocused(false);
    lastSelectionRef.current = editor.selection ?? null;
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  return {
    isEditorFocused,
    keepEditorFocus,
    handleEditorFocus,
    handleEditorBlur,
    exitEditing,
    setExitEditingListener,
    setBlockSelectionListener,
    requestBlockSelection,
  };
}
