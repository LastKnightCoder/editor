import { useCallback, useMemo, type RefObject } from "react";
import { mobileContentPlugins } from "../../../app/plugins/content";
import type { IBlockPanelListItem } from "@tau/editor/api";
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
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Range,
  Transforms,
  type BaseSelection,
  type Path,
} from "slate";
import { ReactEditor } from "slate-react";

import { insertDividerBlock, type ToolbarActionId } from "./toolbarActions";
import { promptInsertWebview } from "./mediaActions";
import type { TtsInsertIntent } from "../tts/ttsInsertTarget";
import { getEditorFromRef } from "./useToolbarSelectionState";
import type {
  EditorPanelKind,
  InsertSheetItemKind,
  MobileEditorToolbarController,
} from "./useMobileEditorToolbarController";

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
  "webview",
  "tts",
  "record",
]);

type ToolbarInsertOptions = {
  editorRef: RefObject<EditorRef | null>;
  activePanel: EditorPanelKind | null;
  restoreEditorSelection: () => SlateEditor | null;
  markSelectionDirty: () => void;
  lastSelectionRef: RefObject<BaseSelection | null>;
  executeAction: (actionId: ToolbarActionId) => void;
  openTts: (editor: SlateEditor, intent: TtsInsertIntent) => void;
  startRecording: (editor: SlateEditor, replace?: { element: SlateElement; path: Path }) => void;
};

/** 插入域：插入面板条目分发、图片直达按钮与插件插入项 */
export function useToolbarInsert({
  editorRef,
  activePanel,
  restoreEditorSelection,
  markSelectionDirty,
  lastSelectionRef,
  executeAction,
  openTts,
  startRecording,
}: ToolbarInsertOptions) {
  /** 插入面板条目分发；面板打开时作用于面板选区且不聚焦，面板开合由调用方负责 */
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
        case "webview":
          // 底部输入框填地址，提交时按打开时的插入位置插入
          void promptInsertWebview(editor);
          break;
        case "annotation":
          insertAnnotation(editor);
          break;
        case "content-link":
          executeAction(kind);
          return;
        case "tts":
          openTts(editor, { kind: "insert" });
          break;
        case "record":
          startRecording(editor);
          break;
      }
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      markSelectionDirty();
    },
    // executeAction 为稳定引用（依赖均为 useCallback），此处引用安全
    [executeAction, markSelectionDirty, openTts, restoreEditorSelection, startRecording]
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

  const pluginInsertItems = useMemo(() => {
    const editor = getEditorFromRef(editorRef);
    if (activePanel !== "insert" || !editor || ReactEditor.isReadOnly(editor)) return [];
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
                keywords: item.keywords,
                icon: item.icon,
                run: () => {
                  const current = restoreEditorSelection();
                  if (current !== editor || ReactEditor.isReadOnly(editor)) return;
                  item.onClick?.(editor);
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
  }, [activePanel, editorRef, restoreEditorSelection, markSelectionDirty]);

  return {
    handleSelectInsertItem,
    handleInsertImage,
    pluginInsertItems,
  };
}
