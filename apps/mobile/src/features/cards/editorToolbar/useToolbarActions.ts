import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { EditorRef } from "@tau/editor";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Range,
  Transforms,
  type BaseSelection,
  type Path,
} from "slate";

import type { ContentLinkPickerIntent } from "../editorExtensions/contentLinkModel";
import type { ContentMentionRequest } from "../editorExtensions/useContentMention";
import {
  applyColorMark as applyColorMarkToEditor,
  applyGradientMark as applyGradientMarkToEditor,
  applyHeaderBlock,
  applyHighlightMark as applyHighlightMarkToEditor,
  applyUnderlineStyle as applyUnderlineStyleToEditor,
  insertDividerBlock,
  isBlockAction,
  isCustomMarkAction,
  isInlineWrapAction,
  isMarkAction,
  toggleComment,
  toggleContentLinkIfActive,
  toggleCustomMark,
  toggleInlineWrap,
  toggleKbd,
  toggleListBlock,
  toggleMark,
  toggleQuoteBlock,
  type TextGradientOption,
  type ToolbarActionId,
  type UnderlineStylePayload,
} from "./toolbarActions";
import { getEditorFromRef } from "./useToolbarSelectionState";

type ListIndentDirection = "indent" | "outdent";

/** 列表项缩进命令，按光标所在最内层列表项类型选择 */
const LIST_INDENT_COMMANDS: Partial<Record<string, Record<ListIndentDirection, string>>> = {
  "check-list-item": {
    indent: "tau.check-list.indent",
    outdent: "tau.check-list.outdent",
  },
  "list-item": {
    indent: "tau.list-item.indent",
    outdent: "tau.list-item.outdent",
  },
};

function getListIndentCommand(node: unknown, direction: ListIndentDirection): string | null {
  const type = (node as { type?: string }).type;
  return type ? (LIST_INDENT_COMMANDS[type]?.[direction] ?? null) : null;
}

type ToolbarActionsOptions = {
  editorRef: RefObject<EditorRef | null>;
  openSheetNextTick: (open: () => void) => void;
  markSelectionDirty: () => void;
  restoreEditorSelection: () => SlateEditor | null;
  lastSelectionRef: RefObject<BaseSelection | null>;
  /** 与 useContentLinkController 共享的同一 ref/setter 实例，executeAction 打开选择器时写入 */
  mentionRef: RefObject<ContentMentionRequest | null>;
  pendingContentLinkSelectionRef: RefObject<BaseSelection | null>;
  contentLinkRetargetPathRef: RefObject<Path | null>;
  setIsContentLinkPickerOpen: Dispatch<SetStateAction<boolean>>;
  setContentLinkPickerIntent: Dispatch<SetStateAction<ContentLinkPickerIntent>>;
};

/** 格式化命令域：工具条动作分发、标题/颜色/渐变/高亮/下划线标记、列表缩进与撤销重做 */
export function useToolbarActions({
  editorRef,
  openSheetNextTick,
  markSelectionDirty,
  restoreEditorSelection,
  lastSelectionRef,
  mentionRef,
  pendingContentLinkSelectionRef,
  contentLinkRetargetPathRef,
  setIsContentLinkPickerOpen,
  setContentLinkPickerIntent,
}: ToolbarActionsOptions) {
  // 插入成功提示里的「撤销」：undo 定义在后，经 ref 取最新实现
  const undoRef = useRef<() => void>(() => undefined);

  const executeAction = useCallback(
    (actionId: ToolbarActionId) => {
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }

      if (actionId === "content-link") {
        mentionRef.current?.cancel();
        if (toggleContentLinkIfActive(editor)) {
          if (editor.selection) {
            lastSelectionRef.current = editor.selection;
          }
          markSelectionDirty();
          return;
        }

        const selection = editor.selection ?? lastSelectionRef.current;
        pendingContentLinkSelectionRef.current = selection;
        contentLinkRetargetPathRef.current = null;
        setContentLinkPickerIntent({
          mode: "insert",
          text:
            selection && !Range.isCollapsed(selection) ? SlateEditor.string(editor, selection) : "",
        });
        openSheetNextTick(() => setIsContentLinkPickerOpen(true));
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
      } else if (isBlockAction(actionId)) {
        if (actionId === "heading-one") {
          applyHeaderBlock(editor, 1);
        } else if (actionId === "heading-two") {
          applyHeaderBlock(editor, 2);
        } else if (actionId === "heading-three") {
          applyHeaderBlock(editor, 3);
        } else if (actionId === "bulleted-list") {
          toggleListBlock(editor, "bulleted-list");
        } else if (actionId === "numbered-list") {
          toggleListBlock(editor, "numbered-list");
        } else if (actionId === "quote") {
          toggleQuoteBlock(editor);
        } else if (actionId === "divider") {
          insertDividerBlock(editor);
        }
      }

      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    [markSelectionDirty, openSheetNextTick, restoreEditorSelection]
  );

  const applyHeadingLevel = useCallback(
    (level: 1 | 2 | 3 | "paragraph") => {
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }
      applyHeaderBlock(editor, level);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection]
  );

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
    [markSelectionDirty, restoreEditorSelection]
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
    [markSelectionDirty, restoreEditorSelection]
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
    [markSelectionDirty, restoreEditorSelection]
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
    [markSelectionDirty, restoreEditorSelection]
  );

  /** 缩进命令只在段首生效（Tab 语义）：先把光标移到列表项开头执行，再经 rangeRef 回到原选区 */
  const runListIndent = useCallback(
    (direction: ListIndentDirection) => {
      const editor = restoreEditorSelection();
      if (!editor?.selection) return;
      const [entry] = SlateEditor.nodes(editor, {
        at: editor.selection,
        match: node =>
          SlateElement.isElement(node) && getListIndentCommand(node, direction) !== null,
        mode: "lowest",
      });
      const commandId = entry ? getListIndentCommand(entry[0], direction) : null;
      if (!entry || !commandId) return;
      const originalRange = SlateEditor.rangeRef(editor, editor.selection);
      Transforms.select(editor, SlateEditor.start(editor, entry[1]));
      editor.commands?.execute(commandId);
      const restored = originalRange.unref();
      if (restored) {
        Transforms.select(editor, restored);
      }
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    [markSelectionDirty, restoreEditorSelection]
  );

  const indent = useCallback(() => runListIndent("indent"), [runListIndent]);
  const outdent = useCallback(() => runListIndent("outdent"), [runListIndent]);

  const undo = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    const withHistory = editor as SlateEditor & { undo: () => void };
    if (typeof withHistory.undo === "function") {
      withHistory.undo();
    }
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  undoRef.current = undo;

  const redo = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    const withHistory = editor as SlateEditor & { redo: () => void };
    if (typeof withHistory.redo === "function") {
      withHistory.redo();
    }
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  return {
    executeAction,
    applyHeadingLevel,
    applyColorMark,
    applyGradientMark,
    applyHighlightMark,
    applyUnderlineStyle,
    indent,
    outdent,
    undo,
    redo,
    undoRef,
  };
}
