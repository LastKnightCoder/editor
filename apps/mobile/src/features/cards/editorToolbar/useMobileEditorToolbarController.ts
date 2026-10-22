import { mobileContentPlugins } from "../../../app/plugins/content";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import { insertTabs } from "@tau/editor/extensions/tabs";
import { insertCallout } from "@tau/editor/extensions/callout";
import { insertDetails } from "@tau/editor/extensions/detail";
import { insertHighlightBlock } from "@tau/editor/extensions/highlight-block";
import { insertTable } from "@tau/editor/extensions/table";
import { insertCheckList } from "@tau/editor/extensions/list";
import { insertAnnotation } from "@tau/editor/extensions/annotation";
import { insertMermaid } from "@tau/editor/extensions/diagram";
import { insertCodeBlock } from "@tau/editor/extensions/code-block";
import { insertBlockMath } from "@tau/editor/extensions/math";
import { openLocalMediaPicker, openMediaUrlInput } from "@tau/editor/extensions/media";
import type { Editor as SlateEditor } from "slate";
import { Range, Transforms, type BaseSelection } from "slate";
import { ReactEditor } from "slate-react";

import type { ContentLinkPickerResult } from "../editorExtensions/ContentLinkPickerSheet";
import { wrapContentLink } from "../editorExtensions/contentLinkTransforms";
import {
  applyColorMark as applyColorMarkToEditor,
  applyGradientMark as applyGradientMarkToEditor,
  applyHeaderBlock,
  applyHighlightMark as applyHighlightMarkToEditor,
  applyUnderlineStyle as applyUnderlineStyleToEditor,
  insertDividerBlock,
  isActionSelectionRequired,
  isBlockAction,
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
  toggleListBlock,
  toggleMark,
  toggleQuoteBlock,
  type ToolbarActionId,
  type TextGradientOption,
  type UnderlineStylePayload,
} from "./toolbarActions";

/** 插入面板条目：媒体选择/块插入/行内标记三类入口（对齐桌面 slash 菜单的移动端子集） */
export type InsertSheetItemKind =
  | "image"
  | "camera"
  | "video"
  | "audio"
  | "image-url"
  | "video-url"
  | "audio-url"
  | "table"
  | "code-block"
  | "check-list"
  | "divider"
  | "tabs"
  | "details"
  | "highlight-block"
  | "callout"
  | "math"
  | "mermaid"
  | "annotation"
  | "comment"
  | "content-link"
  | "styled-text"
  | "kbd";

type UseMobileEditorToolbarControllerOptions = {
  editorRef: RefObject<EditorRef | null>;
};

export type MobileEditorToolbarController = {
  pluginInsertItems: { title: string; icon: IBlockPanelListItem["icon"]; run: () => void }[];
  isEditorFocused: boolean;
  isContentLinkPickerOpen: boolean;
  isInsertSheetOpen: boolean;
  executeAction: (actionId: ToolbarActionId) => void;
  applyHeadingLevel: (level: 1 | 2 | 3 | "paragraph") => void;
  handleOpenInsertSheet: () => void;
  handleCloseInsertSheet: () => void;
  handleSelectInsertItem: (kind: InsertSheetItemKind) => void;
  handleInsertImage: () => void;
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
  undo: () => void;
  redo: () => void;
};

function getEditorFromRef(editorRef: RefObject<EditorRef | null>): SlateEditor | null {
  return (editorRef.current?.getEditor() as SlateEditor | undefined) ?? null;
}

export function useMobileEditorToolbarController(
  options: UseMobileEditorToolbarControllerOptions
): MobileEditorToolbarController {
  const { editorRef } = options;
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isContentLinkPickerOpen, setIsContentLinkPickerOpen] = useState(false);
  const [isInsertSheetOpen, setIsInsertSheetOpen] = useState(false);
  const [selectionVersion, setSelectionVersion] = useState(0);

  const lastSelectionRef = useRef<BaseSelection | null>(null);
  const pendingContentLinkSelectionRef = useRef<BaseSelection | null>(null);

  const markSelectionDirty = useCallback(() => {
    setSelectionVersion(value => value + 1);
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
    const nextSelection = restoreSelectionAndFocus(editor, lastSelectionRef.current);
    if (nextSelection) {
      lastSelectionRef.current = nextSelection;
    }
    return editor;
  }, [editorRef]);

  /** 工具条按钮经 pointerdown 触发，底部面板须延迟一拍挂载：
   *  面板若在当前 tap 结束前 mount，全屏遮罩会接管手势结束时的 hit-test，
   *  Android WebView 把残余 click 派发到遮罩 → 面板秒关甚至编辑器失焦 */
  const openSheetNextTick = useCallback((open: () => void) => {
    window.setTimeout(open, 0);
  }, []);

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

        pendingContentLinkSelectionRef.current = editor.selection ?? lastSelectionRef.current;
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

  const handleCloseContentLinkPicker = useCallback(() => {
    setIsContentLinkPickerOpen(false);
    pendingContentLinkSelectionRef.current = null;
    markSelectionDirty();
  }, [markSelectionDirty]);

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

  const handleOpenInsertSheet = useCallback(() => {
    // 面板让出屏幕：主动收起键盘（选区已记录，选择条目后由 restoreEditorSelection 恢复）
    const editor = getEditorFromRef(editorRef);
    if (editor) {
      ReactEditor.blur(editor as ReactEditor);
    }
    openSheetNextTick(() => setIsInsertSheetOpen(true));
  }, [editorRef, openSheetNextTick]);

  const handleCloseInsertSheet = useCallback(() => {
    setIsInsertSheetOpen(false);
    markSelectionDirty();
  }, [markSelectionDirty]);

  /** 块插入/媒体类条目：共享包 setOrInsertNode 要求 collapsed 选区 */
  const COLLAPSE_BEFORE_INSERT_KINDS = new Set<InsertSheetItemKind>([
    "image",
    "camera",
    "video",
    "audio",
    "table",
    "code-block",
    "check-list",
    "divider",
    "tabs",
    "details",
    "highlight-block",
    "callout",
    "math",
    "mermaid",
  ]);

  /** 插入面板条目分发；面板关闭时序由 ActionSheet 退场缓冲回调 handleCloseInsertSheet */
  const handleSelectInsertItem = useCallback(
    (kind: InsertSheetItemKind) => {
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }
      // 行内标记类（批注/关联内容/样式文本/快捷键）依赖展开选区，不可收拢
      if (
        COLLAPSE_BEFORE_INSERT_KINDS.has(kind) &&
        editor.selection &&
        !Range.isCollapsed(editor.selection)
      ) {
        Transforms.collapse(editor, { edge: "end" });
      }
      switch (kind) {
        case "image":
        case "camera":
        case "video":
        case "audio": {
          // 上传结束/取消后恢复编辑器焦点（键盘回弹）；file picker 打开期间键盘让位给系统
          openLocalMediaPicker(
            editor,
            kind === "image" || kind === "camera" ? "image" : kind,
            undefined,
            {
              capture: kind === "camera",
              onComplete: () => restoreEditorSelection(),
            }
          );
          break;
        }
        case "table":
          insertTable(editor, 3, 3);
          break;
        case "code-block":
          insertCodeBlock(editor);
          break;
        case "check-list":
          insertCheckList(editor);
          break;
        case "divider":
          insertDividerBlock(editor);
          break;
        case "image-url":
        case "video-url":
        case "audio-url": {
          // 输入框经 IEditorNotifier.prompt 走 mobile 的 EditorPromptHost（BottomSheet，接返回手势），提交时按当前选区插入
          const mediaType =
            kind === "image-url" ? "image" : kind === "video-url" ? "video" : "audio";
          void openMediaUrlInput(editor, mediaType);
          break;
        }
        case "tabs":
          insertTabs(editor);
          break;
        case "details":
          insertDetails(editor);
          break;
        case "highlight-block":
          insertHighlightBlock(editor, "red");
          break;
        case "callout":
          insertCallout(editor, "info");
          break;
        case "math":
          insertBlockMath(editor);
          break;
        case "mermaid":
          insertMermaid(editor);
          break;
        case "annotation":
          insertAnnotation(editor, "注解内容");
          break;
        case "comment":
        case "content-link":
        case "styled-text":
        case "kbd":
          executeAction(kind);
          return;
      }
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    // executeAction 为稳定引用（依赖均为 useCallback），此处引用安全
    [executeAction, markSelectionDirty, restoreEditorSelection]
  );

  /** 工具条图片直达按钮：一步拉起系统选图（上传/占位/回填由共享包 mediaInsert 完成），
   *  上传结束/取消后恢复编辑器焦点 */
  const handleInsertImage = useCallback(() => {
    const editor = restoreEditorSelection();
    if (!editor) {
      return;
    }
    if (editor.selection && !Range.isCollapsed(editor.selection)) {
      Transforms.collapse(editor, { edge: "end" });
    }
    openLocalMediaPicker(editor, "image", undefined, {
      onComplete: () => restoreEditorSelection(),
    });
  }, [restoreEditorSelection]);

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

      const selectionToRestore = pendingContentLinkSelectionRef.current ?? lastSelectionRef.current;
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
    [markSelectionDirty, restoreEditorSelection]
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

  const handleEditorBlur = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    setIsEditorFocused(false);
    lastSelectionRef.current = editor.selection ?? null;
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  const undo = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    const withHistory = editor as SlateEditor & { undo: () => void };
    if (typeof withHistory.undo === "function") {
      withHistory.undo();
    }
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  const redo = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    const withHistory = editor as SlateEditor & { redo: () => void };
    if (typeof withHistory.redo === "function") {
      withHistory.redo();
    }
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  const pluginInsertItems = useMemo(() => {
    const editor = getEditorFromRef(editorRef);
    if (!isInsertSheetOpen || !editor || ReactEditor.isReadOnly(editor)) return [];
    const flatten = (
      items: readonly IBlockPanelListItem[],
      parent = ""
    ): MobileEditorToolbarController["pluginInsertItems"] =>
      items.flatMap(item => {
        const title = parent ? `${parent} / ${item.title}` : item.title;
        if (item.children) return flatten(item.children, title);
        return item.onClick
          ? [
              {
                title,
                icon: item.icon,
                run: () => {
                  const current = restoreEditorSelection();
                  if (current !== editor || ReactEditor.isReadOnly(editor)) return;
                  item.onClick?.(editor);
                  setIsInsertSheetOpen(false);
                  markSelectionDirty();
                },
              },
            ]
          : [];
      });
    return flatten(
      mobileContentPlugins.extensions.flatMap(extension =>
        typeof extension.blockPanel === "function"
          ? extension.blockPanel(editor)
          : (extension.blockPanel ?? [])
      )
    );
  }, [isInsertSheetOpen, editorRef, restoreEditorSelection, markSelectionDirty]);

  return useMemo(
    () => ({
      pluginInsertItems,
      isEditorFocused,
      isContentLinkPickerOpen,
      isInsertSheetOpen,
      executeAction,
      applyHeadingLevel,
      handleOpenInsertSheet,
      handleCloseInsertSheet,
      handleSelectInsertItem,
      handleInsertImage,
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
      undo,
      redo,
    }),
    [
      pluginInsertItems,
      isEditorFocused,
      executeAction,
      applyHeadingLevel,
      applyColorMark,
      applyGradientMark,
      applyHighlightMark,
      applyUnderlineStyle,
      handleCloseContentLinkPicker,
      handleCloseInsertSheet,
      handleEditorBlur,
      handleEditorFocus,
      handleInsertImage,
      handleOpenInsertSheet,
      handleSelectContentLink,
      handleSelectInsertItem,
      isActionDisabled,
      isActionActive,
      isContentLinkPickerOpen,
      isInsertSheetOpen,
      keepEditorFocus,
      redo,
      syncSelection,
      undo,
    ]
  );
}

export default useMobileEditorToolbarController;
