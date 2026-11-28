import { useCallback, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import type { TableAlign, TableRowColor } from "@tau/editor/extensions/table";
import { Editor as SlateEditor, Transforms, type BaseSelection } from "slate";

import { restoreSelectionAndFocus } from "./toolbarActions";
import { resolveTableContext, type CodeEditingContext } from "./editingContext";
import { setCodeBlockLanguage as setCodeBlockLanguageOnEditor } from "./codeBlockInput";
import {
  applyRowColor,
  getColumnAlign,
  getRowColor,
  runTableAction as runTableActionOnEditor,
  type TableActionId,
} from "./tableActions";
import { getEditorFromRef } from "./useToolbarSelectionState";

type TableMenuControllerOptions = {
  editorRef: RefObject<EditorRef | null>;
  openSheetNextTick: (open: () => void) => void;
  markSelectionDirty: () => void;
  restoreEditorSelection: () => SlateEditor | null;
  selectionVersion: number;
  lastSelectionRef: RefObject<BaseSelection | null>;
  /** 与 useToolbarSelectionState 共享的同一 ref 实例，记录表格菜单打开期间的选区 */
  tableMenuOpenRef: RefObject<boolean>;
  tableMenuSelectionRef: RefObject<BaseSelection | null>;
};

/** 表格域：表格动作执行、列对齐 / 行颜色查询、「⋯」菜单与行颜色面板开合（含代码块语言设置） */
export function useTableMenuController({
  editorRef,
  openSheetNextTick,
  markSelectionDirty,
  restoreEditorSelection,
  selectionVersion,
  lastSelectionRef,
  tableMenuOpenRef,
  tableMenuSelectionRef,
}: TableMenuControllerOptions) {
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [isRowColorSheetOpen, setIsRowColorSheetOpen] = useState(false);
  // 「⋯」菜单里点了「行颜色」：菜单退场后接着打开颜色面板，期间保持菜单选区、不聚焦
  const pendingRowColorRef = useRef(false);

  const runTableAction = useCallback(
    (actionId: TableActionId) => {
      const editor = restoreEditorSelection();
      if (!editor) return;
      const tableContext = resolveTableContext(editor);
      if (!tableContext) return;
      runTableActionOnEditor(editor, actionId, tableContext);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
        if (tableMenuOpenRef.current) {
          tableMenuSelectionRef.current = editor.selection;
        }
      }
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection]
  );

  const setCodeBlockLanguage = useCallback(
    (context: CodeEditingContext, language: string) => {
      const editor = getEditorFromRef(editorRef);
      if (editor) setCodeBlockLanguageOnEditor(editor, context, language);
    },
    [editorRef]
  );

  const getTableColumnAlign = useCallback((): TableAlign => {
    void selectionVersion;
    const editor = getEditorFromRef(editorRef);
    const tableContext = editor ? resolveTableContext(editor) : null;
    return editor && tableContext ? getColumnAlign(editor, tableContext) : null;
  }, [editorRef, selectionVersion]);

  const getTableRowColor = useCallback((): TableRowColor | null => {
    void selectionVersion;
    const editor = getEditorFromRef(editorRef);
    const selection = tableMenuOpenRef.current ? tableMenuSelectionRef.current : editor?.selection;
    const tableContext = editor && selection ? resolveTableContext(editor, selection) : null;
    return editor && tableContext ? getRowColor(editor, tableContext) : null;
  }, [editorRef, selectionVersion, tableMenuOpenRef, tableMenuSelectionRef]);

  const setTableRowColor = useCallback(
    (color: TableRowColor | null) => {
      const editor = restoreEditorSelection();
      const tableContext = editor ? resolveTableContext(editor) : null;
      if (!editor || !tableContext) return;
      applyRowColor(editor, tableContext, color);
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection]
  );

  const requestRowColorSheet = useCallback(() => {
    pendingRowColorRef.current = true;
  }, []);

  const openTableMenu = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    tableMenuSelectionRef.current = editor.selection ?? lastSelectionRef.current;
    tableMenuOpenRef.current = true;
    openSheetNextTick(() => setIsTableMenuOpen(true));
  }, [editorRef, openSheetNextTick]);

  const closeTableMenu = useCallback(() => {
    if (!tableMenuOpenRef.current) return;
    setIsTableMenuOpen(false);
    if (pendingRowColorRef.current) {
      pendingRowColorRef.current = false;
      setIsRowColorSheetOpen(true);
      return;
    }
    tableMenuOpenRef.current = false;
    setIsRowColorSheetOpen(false);
    const editor = getEditorFromRef(editorRef);
    const saved = tableMenuSelectionRef.current;
    tableMenuSelectionRef.current = null;
    if (!editor) return;
    if (saved) {
      Transforms.select(editor, saved);
    }
    const nextSelection = restoreSelectionAndFocus(editor, saved);
    if (nextSelection) {
      lastSelectionRef.current = nextSelection;
    }
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  return {
    isTableMenuOpen,
    runTableAction,
    setCodeBlockLanguage,
    getTableColumnAlign,
    openTableMenu,
    closeTableMenu,
    isRowColorSheetOpen,
    getTableRowColor,
    setTableRowColor,
    requestRowColorSheet,
  };
}
