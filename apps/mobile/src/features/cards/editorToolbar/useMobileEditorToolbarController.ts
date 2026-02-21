import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor/src";
import type { Editor as SlateEditor } from "slate";
import { Range, Transforms, type BaseSelection } from "slate";
import { ReactEditor } from "slate-react";

import type { ContentLinkPickerResult } from "../editorExtensions/ContentLinkPickerSheet";
import { wrapContentLink } from "../editorExtensions/contentLinkTransforms";
import {
  applyColorMark as applyColorMarkToEditor,
  applyGradientMark as applyGradientMarkToEditor,
  applyHighlightMark as applyHighlightMarkToEditor,
  applyUnderlineStyle as applyUnderlineStyleToEditor,
  isActionSelectionRequired,
  isCustomMarkAction,
  isInlineWrapAction,
  isMarkAction,
  isToolbarActionActive,
  restoreSelectionAndFocus,
  toggleComment,
  toggleCustomMark,
  toggleContentLinkIfActive,
  toggleInlineWrap,
  toggleKbd,
  toggleMark,
  type ToolbarActionId,
  type TextGradientOption,
  type UnderlineStylePayload,
} from "./toolbarActions";

type UseMobileEditorToolbarControllerOptions = {
  editorRef: RefObject<EditorRef | null>;
};

export type MobileEditorToolbarController = {
  isEditorFocused: boolean;
  isContentLinkPickerOpen: boolean;
  executeAction: (actionId: ToolbarActionId) => void;
  applyColorMark: (lightColor?: string, darkColor?: string) => void;
  applyGradientMark: (preset?: TextGradientOption["preset"]) => void;
  applyHighlightMark: (label?: string) => void;
  applyUnderlineStyle: (payload: UnderlineStylePayload) => void;
  isActionDisabled: (actionId: ToolbarActionId) => boolean;
  isActionActive: (actionId: ToolbarActionId) => boolean;
  keepEditorFocus: () => void;
  handleEditorFocus: () => void;
  handleEditorBlur: () => void;
  syncSelection: () => void;
  handleCloseContentLinkPicker: () => void;
  handleSelectContentLink: (result: ContentLinkPickerResult) => void;
};

function getEditorFromRef(
  editorRef: RefObject<EditorRef | null>,
): SlateEditor | null {
  return (editorRef.current?.getEditor() as SlateEditor | undefined) ?? null;
}

export function useMobileEditorToolbarController(
  options: UseMobileEditorToolbarControllerOptions,
): MobileEditorToolbarController {
  const { editorRef } = options;
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isContentLinkPickerOpen, setIsContentLinkPickerOpen] = useState(false);
  const [selectionVersion, setSelectionVersion] = useState(0);

  const lastSelectionRef = useRef<BaseSelection | null>(null);
  const pendingContentLinkSelectionRef = useRef<BaseSelection | null>(null);

  const markSelectionDirty = useCallback(() => {
    setSelectionVersion((value) => value + 1);
  }, []);

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
    const nextSelection = restoreSelectionAndFocus(
      editor,
      lastSelectionRef.current,
    );
    if (nextSelection) {
      lastSelectionRef.current = nextSelection;
    }
    return editor;
  }, [editorRef]);

  const executeAction = useCallback(
    (actionId: ToolbarActionId) => {
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }

      if (actionId === "content-link") {
        if (toggleContentLinkIfActive(editor)) {
          if (editor.selection) {
            lastSelectionRef.current = editor.selection;
          }
          markSelectionDirty();
          return;
        }

        pendingContentLinkSelectionRef.current =
          editor.selection ?? lastSelectionRef.current;
        setIsContentLinkPickerOpen(true);
        markSelectionDirty();
        return;
      }

      if (isMarkAction(actionId)) {
        toggleMark(editor, actionId);
      } else if (isInlineWrapAction(actionId)) {
        toggleInlineWrap(editor, actionId);
      } else if (isCustomMarkAction(actionId)) {
        toggleCustomMark(editor, actionId);
      } else if (actionId === "kbd") {
        toggleKbd(editor);
      } else if (actionId === "comment") {
        toggleComment(editor);
      }

      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection],
  );

  const handleCloseContentLinkPicker = useCallback(() => {
    setIsContentLinkPickerOpen(false);
    pendingContentLinkSelectionRef.current = null;
    markSelectionDirty();
  }, [markSelectionDirty]);

  const applyColorMark = useCallback(
    (lightColor?: string, darkColor?: string) => {
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }
      applyColorMarkToEditor(editor, lightColor, darkColor);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection],
  );

  const applyGradientMark = useCallback(
    (preset?: TextGradientOption["preset"]) => {
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }
      applyGradientMarkToEditor(editor, preset);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection],
  );

  const applyHighlightMark = useCallback(
    (label?: string) => {
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }
      applyHighlightMarkToEditor(editor, label);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection],
  );

  const applyUnderlineStyle = useCallback(
    (payload: UnderlineStylePayload) => {
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }
      applyUnderlineStyleToEditor(editor, payload);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection],
  );

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

  const handleSelectContentLink = useCallback(
    (result: ContentLinkPickerResult) => {
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }

      const selectionToRestore =
        pendingContentLinkSelectionRef.current ?? lastSelectionRef.current;
      if (selectionToRestore) {
        Transforms.select(editor, selectionToRestore);
      }

      wrapContentLink(editor, {
        contentId: result.contentId,
        contentType: result.contentType,
        contentTitle: result.contentTitle,
        refId: result.refId,
        displayText: result.displayText,
      });

      ReactEditor.focus(editor as ReactEditor);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      pendingContentLinkSelectionRef.current = null;
      setIsContentLinkPickerOpen(false);
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection],
  );

  const handleEditorFocus = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    setIsEditorFocused(true);
    lastSelectionRef.current = editor.selection ?? null;
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

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
    [editorRef, selectionVersion],
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
    [editorRef, isActionDisabled, selectionVersion],
  );

  const handleEditorBlur = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    setIsEditorFocused(false);
    lastSelectionRef.current = editor.selection ?? null;
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  return useMemo(
    () => ({
      isEditorFocused,
      isContentLinkPickerOpen,
      executeAction,
      applyColorMark,
      applyGradientMark,
      applyHighlightMark,
      applyUnderlineStyle,
      isActionDisabled,
      isActionActive,
      keepEditorFocus,
      handleEditorFocus,
      handleEditorBlur,
      syncSelection,
      handleCloseContentLinkPicker,
      handleSelectContentLink,
    }),
    [
      isEditorFocused,
      executeAction,
      applyColorMark,
      applyGradientMark,
      applyHighlightMark,
      applyUnderlineStyle,
      handleCloseContentLinkPicker,
      handleEditorBlur,
      handleEditorFocus,
      handleSelectContentLink,
      isActionDisabled,
      isActionActive,
      isContentLinkPickerOpen,
      keepEditorFocus,
      syncSelection,
    ],
  );
}

export default useMobileEditorToolbarController;
