import { useCallback, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { Range, type BaseSelection } from "slate";

import {
  getBlockKindAt,
  getSelectionMarks,
  isActionSelectionRequired,
  isToolbarActionActive,
  type CurrentBlockKind,
  type ToolbarActionId,
} from "./toolbarActions";
import { getEditorFromRef } from "./useToolbarSelectionState";
import type { EditorPanelKind } from "./useMobileEditorToolbarController";

type ToolbarSelectionQueriesOptions = {
  editorRef: RefObject<EditorRef | null>;
  selectionVersion: number;
  activePanel: EditorPanelKind | null;
  panelSelection: BaseSelection | null;
};

/** 选区查询域：动作禁用/激活态、当前块类型与 marks（依赖 selectionVersion 及时刷新） */
export function useToolbarSelectionQueries({
  editorRef,
  selectionVersion,
  activePanel,
  panelSelection,
}: ToolbarSelectionQueriesOptions) {
  const isActionDisabled = useCallback(
    (actionId: ToolbarActionId): boolean => {
      // 依赖 selectionVersion 触发重算，保证禁用态及时刷新
      void selectionVersion;
      const editor = getEditorFromRef(editorRef);
      if (!editor) {
        return true;
      }
      if (!isActionSelectionRequired(actionId)) {
        return false;
      }
      return !editor.selection || Range.isCollapsed(editor.selection);
    },
    [editorRef, selectionVersion]
  );

  const isActionActive = useCallback(
    (actionId: ToolbarActionId): boolean => {
      // 依赖 selectionVersion 触发重算，保证工具栏选中态及时刷新
      void selectionVersion;
      if (isActionDisabled(actionId)) {
        return false;
      }
      const editor = getEditorFromRef(editorRef);
      if (!editor) {
        return false;
      }
      return isToolbarActionActive(editor, actionId);
    },
    [editorRef, isActionDisabled, selectionVersion]
  );

  const getCurrentBlockKind = useCallback((): CurrentBlockKind => {
    // 依赖 selectionVersion 触发重算，保证「转换为」高亮及时刷新
    void selectionVersion;
    const editor = getEditorFromRef(editorRef);
    if (!editor) return "other";
    const selection = activePanel ? (panelSelection ?? editor.selection) : editor.selection;
    return getBlockKindAt(editor, selection);
  }, [activePanel, editorRef, panelSelection, selectionVersion]);

  const getCurrentMarks = useCallback((): Record<string, unknown> | null => {
    void selectionVersion;
    const editor = getEditorFromRef(editorRef);
    return editor ? getSelectionMarks(editor) : null;
  }, [editorRef, selectionVersion]);

  return {
    isActionDisabled,
    isActionActive,
    getCurrentBlockKind,
    getCurrentMarks,
  };
}
