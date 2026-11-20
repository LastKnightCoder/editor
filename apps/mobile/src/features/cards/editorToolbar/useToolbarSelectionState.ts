import { useCallback, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { Editor as SlateEditor, Transforms, type BaseSelection } from "slate";

import { restoreSelectionAndFocus } from "./toolbarActions";
import type { EditorPanelKind } from "./useMobileEditorToolbarController";

export function getEditorFromRef(editorRef: RefObject<EditorRef | null>): SlateEditor | null {
  return (editorRef.current?.getEditor() as SlateEditor | undefined) ?? null;
}

type ToolbarSelectionStateOptions = {
  editorRef: RefObject<EditorRef | null>;
};

/** 选区状态核心：面板/表格菜单的选区记忆与恢复、选区版本号与编辑器访问入口，供各域子 hook 组装 */
export function useToolbarSelectionState({ editorRef }: ToolbarSelectionStateOptions) {
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [panelSelection, setPanelSelection] = useState<BaseSelection | null>(null);

  const lastSelectionRef = useRef<BaseSelection | null>(null);
  // 同步记录面板开关，回键盘触发的编辑器 focus 据此与「点正文」区分
  const activePanelRef = useRef<EditorPanelKind | null>(null);
  const panelSelectionRef = useRef<BaseSelection | null>(null);
  const tableMenuOpenRef = useRef(false);
  const tableMenuSelectionRef = useRef<BaseSelection | null>(null);

  const rememberPanelSelection = useCallback((selection: BaseSelection | null) => {
    panelSelectionRef.current = selection;
    setPanelSelection(selection);
  }, []);

  /** 选区相关状态的统一收尾：面板打开时把编辑器选区存回面板选区 */
  const markSelectionDirty = useCallback(() => {
    if (activePanelRef.current) {
      const selection = getEditorFromRef(editorRef)?.selection;
      if (selection) {
        rememberPanelSelection(selection);
      }
    }
    setSelectionVersion(value => value + 1);
  }, [editorRef, rememberPanelSelection]);

  const syncSelection = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    lastSelectionRef.current = editor.selection ?? null;
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  const restoreEditorSelection = useCallback((): SlateEditor | null => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) {
      return null;
    }
    // 面板打开期间操作作用于面板选区且不聚焦，避免键盘弹出顶掉面板
    if (activePanelRef.current) {
      if (panelSelectionRef.current) {
        Transforms.select(editor, panelSelectionRef.current);
      }
      return editor;
    }
    // 表格菜单打开期间同理：作用于打开时保存的选区，关闭菜单时再聚焦
    if (tableMenuOpenRef.current) {
      if (tableMenuSelectionRef.current) {
        Transforms.select(editor, tableMenuSelectionRef.current);
      }
      return editor;
    }
    const nextSelection = restoreSelectionAndFocus(editor, lastSelectionRef.current);
    if (nextSelection) {
      lastSelectionRef.current = nextSelection;
    }
    return editor;
  }, [editorRef]);

  const runInPanel = useCallback(
    (fn: (editor: SlateEditor) => void) => {
      const editor = getEditorFromRef(editorRef);
      if (!editor) return;
      if (panelSelectionRef.current) {
        Transforms.select(editor, panelSelectionRef.current);
      }
      fn(editor);
      rememberPanelSelection(editor.selection ?? null);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    [editorRef, markSelectionDirty, rememberPanelSelection]
  );

  const collapseSelectionToFocus = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor?.selection) return;
    Transforms.collapse(editor, { edge: "focus" });
    lastSelectionRef.current = editor.selection;
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  const getEditableElement = useCallback(
    () => editorRef.current?.getEditableElement(),
    [editorRef]
  );
  const getEditor = useCallback(() => getEditorFromRef(editorRef), [editorRef]);

  return {
    getEditableElement,
    getEditor,
    lastSelectionRef,
    selectionVersion,
    activePanelRef,
    panelSelectionRef,
    panelSelection,
    tableMenuOpenRef,
    tableMenuSelectionRef,
    rememberPanelSelection,
    markSelectionDirty,
    syncSelection,
    restoreEditorSelection,
    runInPanel,
    collapseSelectionToFocus,
  };
}
