import { useCallback, useEffect, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { Editor as SlateEditor, type BaseSelection } from "slate";
import { ReactEditor } from "slate-react";

import {
  TEXT_CONTEXT,
  getEditingContextKey,
  isVoidEditorContext,
  useEditingContext,
} from "./editingContext";
import { restoreSelectionAndFocus } from "./toolbarActions";
import { clearKeyboardSwap } from "./keyboardSwap";
import { getEditorFromRef } from "./useToolbarSelectionState";
import type { ClosePanelOptions, EditorPanelKind } from "./useMobileEditorToolbarController";

type ToolbarVisibilityOptions = {
  editorRef: RefObject<EditorRef | null>;
  selectionVersion: number;
  isEditorFocused: boolean;
  activePanel: EditorPanelKind | null;
  isTableMenuOpen: boolean;
  getEditableElement: () => HTMLElement | null | undefined;
  closePanel: (options: ClosePanelOptions) => void;
  markSelectionDirty: () => void;
  lastSelectionRef: RefObject<BaseSelection | null>;
  /** 与 useToolbarSelectionState 共享的同一 ref 实例，void 联动据此关面板 */
  activePanelRef: RefObject<EditorPanelKind | null>;
};

/** 可见性域：编辑上下文派生与退回、配件栏显隐、媒体/源码块选中时收键盘联动 */
export function useToolbarVisibility({
  editorRef,
  selectionVersion,
  isEditorFocused,
  activePanel,
  isTableMenuOpen,
  getEditableElement,
  closePanel,
  markSelectionDirty,
  lastSelectionRef,
  activePanelRef,
}: ToolbarVisibilityOptions) {
  const [dismissedContextKey, setDismissedContextKey] = useState<string | null>(null);

  const rawEditingContext = useEditingContext(editorRef, selectionVersion);
  const rawContextKey = getEditingContextKey(rawEditingContext);

  // 光标离开被退回的上下文即清除记录
  useEffect(() => {
    if (dismissedContextKey !== null && dismissedContextKey !== rawContextKey) {
      setDismissedContextKey(null);
    }
  }, [dismissedContextKey, rawContextKey]);

  const editingContext =
    dismissedContextKey !== null && dismissedContextKey === rawContextKey
      ? TEXT_CONTEXT
      : rawEditingContext;

  const dismissEditingContext = useCallback(() => {
    setDismissedContextKey(rawContextKey);
  }, [rawContextKey]);

  const isToolbarVisible =
    isEditorFocused ||
    activePanel !== null ||
    isTableMenuOpen ||
    isVoidEditorContext(rawEditingContext) ||
    rawEditingContext.kind === "media" ||
    rawEditingContext.kind === "source-block";

  // 选中媒体 / 源码块：收起键盘（编辑态保持），文字面板让位；离开媒体时关掉媒体面板
  const mediaSelectedKey =
    rawEditingContext.kind === "media" && !rawEditingContext.captionEditing ? rawContextKey : null;
  const voidSelectedKey =
    mediaSelectedKey ?? (rawEditingContext.kind === "source-block" ? rawContextKey : null);
  useEffect(() => {
    if (mediaSelectedKey === null && activePanelRef.current === "media") {
      closePanel({ showKeyboard: false });
    }
    if (voidSelectedKey === null) return;
    if (activePanelRef.current && activePanelRef.current !== "media") {
      closePanel({ showKeyboard: false });
    }
    const editor = getEditorFromRef(editorRef);
    if (editor && ReactEditor.isFocused(editor as ReactEditor)) {
      clearKeyboardSwap(getEditableElement());
      ReactEditor.blur(editor as ReactEditor);
    }
  }, [closePanel, editorRef, getEditableElement, mediaSelectedKey, voidSelectedKey]);

  const focusAfterVoid = useCallback(
    (place: (editor: SlateEditor) => void) => {
      const editor = getEditorFromRef(editorRef);
      if (!editor) return;
      if (activePanelRef.current) closePanel({ showKeyboard: false });
      place(editor);
      // 在点击内同步聚焦，iOS 才会弹出键盘
      const nextSelection = restoreSelectionAndFocus(editor, editor.selection);
      lastSelectionRef.current = nextSelection ?? editor.selection ?? null;
      markSelectionDirty();
    },
    [closePanel, editorRef, markSelectionDirty]
  );

  const runMediaEdit = useCallback(
    (fn: (editor: SlateEditor) => void) => {
      const editor = getEditorFromRef(editorRef);
      if (!editor) return;
      fn(editor);
      markSelectionDirty();
    },
    [editorRef, markSelectionDirty]
  );

  return {
    editingContext,
    dismissEditingContext,
    isToolbarVisible,
    focusAfterVoid,
    runMediaEdit,
  };
}
