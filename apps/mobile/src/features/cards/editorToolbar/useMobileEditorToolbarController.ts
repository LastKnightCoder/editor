import { mobileContentPlugins } from "../../../app/plugins/content";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { EditorRef } from "@tau/editor";
import { insertTabs } from "@tau/editor/extensions/tabs";
import { insertCallout } from "@tau/editor/extensions/callout";
import { insertDetails } from "@tau/editor/extensions/detail";
import { insertHighlightBlock } from "@tau/editor/extensions/highlight-block";
import { insertTable, type TableAlign } from "@tau/editor/extensions/table";
import { insertCheckList } from "@tau/editor/extensions/list";
import { insertAnnotation } from "@tau/editor/extensions/annotation";
import { insertMermaid } from "@tau/editor/extensions/diagram";
import { insertCodeBlock } from "@tau/editor/extensions/code-block";
import { insertBlockMath } from "@tau/editor/extensions/math";
import { openLocalMediaPicker, openMediaUrlInput } from "@tau/editor/extensions/media";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node as SlateNode,
  Range,
  Transforms,
  type BaseSelection,
  type Path,
} from "slate";
import { ReactEditor } from "slate-react";

import { useKeyboardReservation } from "../../../components/KeyboardViewportProvider";
import type { ContentLinkPickerResult } from "../editorExtensions/ContentLinkPickerSheet";
import {
  CONTENT_LINK_TYPE,
  readContentLinkTarget,
  type ContentLinkPickerIntent,
  type ContentLinkTarget,
} from "../editorExtensions/contentLinkModel";
import { retargetContentLink, wrapContentLink } from "../editorExtensions/contentLinkTransforms";
import type { ContentMentionRequest } from "../editorExtensions/useContentMention";
import { toast } from "../../../components/toast";
import {
  applyColorMark as applyColorMarkToEditor,
  applyGradientMark as applyGradientMarkToEditor,
  applyHeaderBlock,
  applyHighlightMark as applyHighlightMarkToEditor,
  applyUnderlineStyle as applyUnderlineStyleToEditor,
  getBlockKindAt,
  getSelectionMarks,
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
  type CurrentBlockKind,
  type ToolbarActionId,
  type TextGradientOption,
  type UnderlineStylePayload,
} from "./toolbarActions";
import {
  TEXT_CONTEXT,
  getEditingContextKey,
  isVoidEditorContext,
  resolveContentLinkContext,
  resolveTableContext,
  useEditingContext,
  type CodeEditingContext,
  type EditingContext,
} from "./editingContext";
import { promptInsertWebview } from "./mediaActions";
import { setCodeBlockLanguage as setCodeBlockLanguageOnEditor } from "./codeBlockInput";
import {
  getColumnAlign,
  runTableAction as runTableActionOnEditor,
  type TableActionId,
} from "./tableActions";
import {
  DEFAULT_KEYBOARD_SWAP_STRATEGY,
  clearKeyboardSwap,
  hideKeyboard,
  showKeyboard,
} from "./keyboardSwap";

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
  | "webview"
  | "annotation"
  | "content-link";

/** 占用键盘位置的面板：Aa 样式面板 / + 插入面板 / 媒体尺寸面板（选中媒体时，键盘已收起） */
export type EditorPanelKind = "style" | "insert" | "media";

export type ClosePanelOptions = {
  /** 是否弹回键盘；用户点正文时键盘由系统弹出，传 false */
  showKeyboard: boolean;
  /** 弹回键盘时是否恢复面板保存的选区，默认 false */
  restoreSelection?: boolean;
};

type ListIndentDirection = "indent" | "outdent";

const INSERT_PICKER_INTENT: ContentLinkPickerIntent = { mode: "insert", text: "" };

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

type UseMobileEditorToolbarControllerOptions = {
  editorRef: RefObject<EditorRef | null>;
};

export type MobileEditorToolbarController = {
  pluginInsertItems: {
    title: string;
    keywords: string[];
    icon: IBlockPanelListItem["icon"];
    run: () => void;
  }[];
  isEditorFocused: boolean;
  /** 编辑器聚焦、面板或表格菜单打开、焦点在 void 内部编辑器时配件栏可见（这些情况下 Slate 处于失焦） */
  isToolbarVisible: boolean;
  /** 配件栏当前上下文；被手动退回的上下文按 text 给出 */
  editingContext: EditingContext;
  /** 把当前上下文退回通用模式，光标离开该上下文后自动恢复 */
  dismissEditingContext: () => void;
  /** 在光标所在表格上执行动作，执行后标记选区变化 */
  runTableAction: (actionId: TableActionId) => void;
  /** 设置代码块语言（经 tau.code-block.set-language 命令），不处理焦点 */
  setCodeBlockLanguage: (context: CodeEditingContext, language: string) => void;
  /** 光标所在列的对齐，不在表格内为 null */
  getTableColumnAlign: () => TableAlign;
  /** 表格「⋯」菜单开合：打开时保存选区，关闭时恢复选区与焦点 */
  isTableMenuOpen: boolean;
  openTableMenu: () => void;
  closeTableMenu: () => void;
  activePanel: EditorPanelKind | null;
  /** 打开面板时保存的选区，面板内操作作用于它 */
  panelSelection: BaseSelection | null;
  /** 缩进命令无 when 可查，按钮常态可点 */
  canIndent: boolean;
  canOutdent: boolean;
  /** 收起键盘并在原位置打开同高面板；panelHeight 为预留高度 */
  openPanel: (kind: EditorPanelKind, panelHeight: number) => void;
  /** 同一面板再点回到键盘，否则打开或切换面板 */
  togglePanel: (kind: EditorPanelKind, panelHeight: number) => void;
  closePanel: (options: ClosePanelOptions) => void;
  /** 关面板、释放预留并收起键盘（Slate 失焦），不通知退出编辑监听，编辑态保持 */
  dismissKeyboard: () => void;
  /** 关面板、释放预留并收起键盘，最后通知退出编辑监听 */
  exitEditing: () => void;
  /** 登记退出编辑监听（宿主据此回阅读态）；传 null 取消，同一时刻只保留一个 */
  setExitEditingListener: (listener: (() => void) | null) => void;
  /** 登记块选择入口（宿主接入块选择时），参数为顶层块下标；传 null 取消 */
  setBlockSelectionListener: (listener: ((index: number) => void) | null) => void;
  /** 宿主已接入块选择时进入块选择并选中该顶层块，返回是否已处理 */
  requestBlockSelection: (index: number) => boolean;
  /** 按 place 放好光标（如选中的媒体 / 源码块之后）并弹出键盘（这些上下文的「键盘」按钮） */
  focusAfterVoid: (place: (editor: SlateEditor) => void) => void;
  /** 编辑区 DOM（媒体档位换算可用宽度） */
  getEditableElement: () => HTMLElement | null | undefined;
  /** 当前 Slate 编辑器实例，未挂载时为 null */
  getEditor: () => SlateEditor | null;
  /** 在编辑器上执行媒体改动并刷新配件栏状态，不处理焦点 */
  runMediaEdit: (fn: (editor: SlateEditor) => void) => void;
  /** 在面板保存的选区上执行操作，不聚焦编辑器 */
  runInPanel: (fn: (editor: SlateEditor) => void) => void;
  indent: () => void;
  outdent: () => void;
  /** 把展开选区折叠到焦点端（退出格式模式） */
  collapseSelectionToFocus: () => void;
  isContentLinkPickerOpen: boolean;
  openContentMention: (request: ContentMentionRequest) => void;
  contentLinkPickerIntent: ContentLinkPickerIntent;
  /** 引用模式「更换」：打开选择器，选中后改写光标所在引用的目标 */
  retargetContentLink: () => void;
  /** 引用模式「预览」打开的引用；面板打开期间键盘收起 */
  contentLinkPreview: ContentLinkTarget | null;
  openContentLinkPreview: () => void;
  /** reason 为 "open" 时随后跳转详情页，不恢复焦点 */
  closeContentLinkPreview: (reason?: "open") => void;
  executeAction: (actionId: ToolbarActionId) => void;
  applyHeadingLevel: (level: 1 | 2 | 3 | "paragraph") => void;
  handleSelectInsertItem: (kind: InsertSheetItemKind) => void;
  handleInsertImage: () => void;
  applyColorMark: (lightColor?: string, darkColor?: string) => void;
  applyGradientMark: (preset?: TextGradientOption["preset"]) => void;
  applyHighlightMark: (label?: string) => void;
  applyUnderlineStyle: (payload: UnderlineStylePayload) => void;
  isActionDisabled: (actionId: ToolbarActionId) => boolean;
  isActionActive: (actionId: ToolbarActionId) => boolean;
  /** 面板打开时按面板选区、否则按编辑器选区判断当前块类型 */
  getCurrentBlockKind: () => CurrentBlockKind;
  /** 当前选区的文本 marks（color / highlight 等），无选区为 null */
  getCurrentMarks: () => Record<string, unknown> | null;
  keepEditorFocus: () => void;
  handleEditorFocus: () => void;
  handleEditorBlur: () => void;
  syncSelection: () => void;
  handleCloseContentLinkPicker: () => void;
  handleSelectContentLink: (result: ContentLinkPickerResult) => void;
  undo: () => void;
  redo: () => void;
};

function getListIndentCommand(node: unknown, direction: ListIndentDirection): string | null {
  const type = (node as { type?: string }).type;
  return type ? (LIST_INDENT_COMMANDS[type]?.[direction] ?? null) : null;
}

function getEditorFromRef(editorRef: RefObject<EditorRef | null>): SlateEditor | null {
  return (editorRef.current?.getEditor() as SlateEditor | undefined) ?? null;
}

export function useMobileEditorToolbarController(
  options: UseMobileEditorToolbarControllerOptions
): MobileEditorToolbarController {
  const { editorRef } = options;
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  const [isContentLinkPickerOpen, setIsContentLinkPickerOpen] = useState(false);
  const [contentLinkPickerIntent, setContentLinkPickerIntent] =
    useState<ContentLinkPickerIntent>(INSERT_PICKER_INTENT);
  const [contentLinkPreview, setContentLinkPreview] = useState<ContentLinkTarget | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [activePanel, setActivePanel] = useState<EditorPanelKind | null>(null);
  const [panelSelection, setPanelSelection] = useState<BaseSelection | null>(null);
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const [dismissedContextKey, setDismissedContextKey] = useState<string | null>(null);
  const reservation = useKeyboardReservation();

  const lastSelectionRef = useRef<BaseSelection | null>(null);
  const pendingContentLinkSelectionRef = useRef<BaseSelection | null>(null);
  const contentLinkRetargetPathRef = useRef<Path | null>(null);
  const mentionRef = useRef<ContentMentionRequest | null>(null);
  const contentLinkPreviewSelectionRef = useRef<BaseSelection | null>(null);
  // 同步记录面板开关，回键盘触发的编辑器 focus 据此与「点正文」区分
  const activePanelRef = useRef<EditorPanelKind | null>(null);
  const panelSelectionRef = useRef<BaseSelection | null>(null);
  const exitEditingListenerRef = useRef<(() => void) | null>(null);
  const blockSelectionListenerRef = useRef<((index: number) => void) | null>(null);
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

  const handleCloseContentLinkPicker = useCallback(() => {
    const mention = mentionRef.current;
    mentionRef.current = null;
    mention?.cancel();
    setIsContentLinkPickerOpen(false);
    pendingContentLinkSelectionRef.current = null;
    contentLinkRetargetPathRef.current = null;
    markSelectionDirty();
  }, [markSelectionDirty]);

  const openContentMention = useCallback(
    (request: ContentMentionRequest) => {
      mentionRef.current?.cancel();
      mentionRef.current = request;
      pendingContentLinkSelectionRef.current = null;
      contentLinkRetargetPathRef.current = null;
      setContentLinkPickerIntent(INSERT_PICKER_INTENT);
      request.signal.addEventListener(
        "abort",
        () => {
          if (mentionRef.current === request) {
            mentionRef.current = null;
            setIsContentLinkPickerOpen(false);
          }
        },
        { once: true }
      );
      openSheetNextTick(() => {
        if (!request.signal.aborted && mentionRef.current === request)
          setIsContentLinkPickerOpen(true);
      });
    },
    [openSheetNextTick]
  );
  useEffect(() => () => mentionRef.current?.cancel(), []);

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
  ]);

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
          insertAnnotation(editor, "注解内容");
          break;
        case "content-link":
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
      const mention = mentionRef.current;
      if (mention) {
        mentionRef.current = null;
        const applied = mention.select(result);
        setIsContentLinkPickerOpen(false);
        if (!applied) toast({ type: "warning", text: "引用位置已变化，请重新输入 @" });
        else {
          const editor = getEditorFromRef(editorRef);
          if (editor) {
            ReactEditor.focus(editor as ReactEditor);
            lastSelectionRef.current = editor.selection;
          }
        }
        markSelectionDirty();
        return;
      }
      const editor = restoreEditorSelection();
      if (!editor) {
        return;
      }

      const selectionToRestore = pendingContentLinkSelectionRef.current ?? lastSelectionRef.current;
      if (selectionToRestore) {
        Transforms.select(editor, selectionToRestore);
      }

      const retargetPath = contentLinkRetargetPathRef.current;
      contentLinkRetargetPathRef.current = null;
      if (retargetPath) {
        const node = SlateNode.has(editor, retargetPath)
          ? SlateNode.get(editor, retargetPath)
          : null;
        if (
          SlateElement.isElement(node) &&
          (node as { type?: string }).type === CONTENT_LINK_TYPE
        ) {
          retargetContentLink(editor, retargetPath, result);
        }
      } else {
        wrapContentLink(editor, result);
      }

      ReactEditor.focus(editor as ReactEditor);
      if (editor.selection) {
        lastSelectionRef.current = editor.selection;
      }
      pendingContentLinkSelectionRef.current = null;
      setIsContentLinkPickerOpen(false);
      markSelectionDirty();
    },
    [editorRef, markSelectionDirty, restoreEditorSelection]
  );

  const getEditableElement = useCallback(
    () => editorRef.current?.getEditableElement(),
    [editorRef]
  );
  const getEditor = useCallback(() => getEditorFromRef(editorRef), [editorRef]);

  const openPanel = useCallback(
    (kind: EditorPanelKind, panelHeight: number) => {
      const editor = getEditorFromRef(editorRef);
      if (!editor) return;
      if (activePanelRef.current) {
        activePanelRef.current = kind;
        setActivePanel(kind);
        return;
      }
      rememberPanelSelection(editor.selection ?? lastSelectionRef.current);
      activePanelRef.current = kind;
      // 预留与面板同一帧生效，键盘收起时正文可视区不跳动
      flushSync(() => {
        reservation.reserve(panelHeight);
        setActivePanel(kind);
      });
      hideKeyboard(editor, DEFAULT_KEYBOARD_SWAP_STRATEGY, getEditableElement());
    },
    [editorRef, getEditableElement, rememberPanelSelection, reservation]
  );

  const closePanel = useCallback(
    (closeOptions: ClosePanelOptions) => {
      if (!activePanelRef.current) return;
      // 先置位，回键盘触发的编辑器 focus 不再走点正文路径
      activePanelRef.current = null;
      const editor = getEditorFromRef(editorRef);
      if (editor && closeOptions.showKeyboard) {
        const saved = panelSelectionRef.current;
        if (closeOptions.restoreSelection && saved) {
          Transforms.select(editor, saved);
        }
        showKeyboard(editor, DEFAULT_KEYBOARD_SWAP_STRATEGY, getEditableElement(), saved, {
          restoreSelection: closeOptions.restoreSelection ?? false,
        });
      }
      setActivePanel(null);
      reservation.releaseWhenKeyboardShown();
      markSelectionDirty();
    },
    [editorRef, getEditableElement, markSelectionDirty, reservation]
  );

  const togglePanel = useCallback(
    (kind: EditorPanelKind, panelHeight: number) => {
      if (activePanelRef.current === kind) {
        closePanel({ showKeyboard: true, restoreSelection: true });
        return;
      }
      openPanel(kind, panelHeight);
    },
    [closePanel, openPanel]
  );

  const dismissKeyboard = useCallback(() => {
    activePanelRef.current = null;
    setActivePanel(null);
    reservation.releaseNow();
    clearKeyboardSwap(getEditableElement());
    const editor = getEditorFromRef(editorRef);
    if (editor && ReactEditor.isFocused(editor as ReactEditor)) {
      ReactEditor.blur(editor as ReactEditor);
    }
  }, [editorRef, getEditableElement, reservation]);

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

  // 宿主卸载时面板仍开着则释放预留，避免下一页底部留白
  useEffect(() => {
    return () => {
      if (activePanelRef.current) {
        activePanelRef.current = null;
        reservation.releaseNow();
      }
    };
  }, [reservation]);

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

  const collapseSelectionToFocus = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor?.selection) return;
    Transforms.collapse(editor, { edge: "focus" });
    lastSelectionRef.current = editor.selection;
    markSelectionDirty();
  }, [editorRef, markSelectionDirty]);

  const indent = useCallback(() => runListIndent("indent"), [runListIndent]);
  const outdent = useCallback(() => runListIndent("outdent"), [runListIndent]);

  const handleEditorFocus = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    // 面板打开时编辑器重新获得焦点 = 用户点了正文：选区由点击位置决定，只关面板
    if (activePanelRef.current) {
      closePanel({ showKeyboard: false });
    }
    setIsEditorFocused(true);
    lastSelectionRef.current = editor.selection ?? null;
    markSelectionDirty();
  }, [closePanel, editorRef, markSelectionDirty]);

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

  const openTableMenu = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    if (!editor) return;
    tableMenuSelectionRef.current = editor.selection ?? lastSelectionRef.current;
    tableMenuOpenRef.current = true;
    openSheetNextTick(() => setIsTableMenuOpen(true));
  }, [editorRef, openSheetNextTick]);

  const closeTableMenu = useCallback(() => {
    if (!tableMenuOpenRef.current) return;
    tableMenuOpenRef.current = false;
    setIsTableMenuOpen(false);
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

  const retargetContentLinkAtCursor = useCallback(() => {
    mentionRef.current?.cancel();
    const editor = getEditorFromRef(editorRef);
    const context = editor ? resolveContentLinkContext(editor) : null;
    if (!editor || !context) return;
    pendingContentLinkSelectionRef.current = editor.selection ?? lastSelectionRef.current;
    contentLinkRetargetPathRef.current = context.path;
    setContentLinkPickerIntent({ mode: "replace", text: SlateNode.string(context.element) });
    openSheetNextTick(() => setIsContentLinkPickerOpen(true));
  }, [editorRef, openSheetNextTick]);

  const openContentLinkPreview = useCallback(() => {
    const editor = getEditorFromRef(editorRef);
    const context = editor ? resolveContentLinkContext(editor) : null;
    if (!editor || !context) return;
    contentLinkPreviewSelectionRef.current = editor.selection ?? lastSelectionRef.current;
    const target = readContentLinkTarget(context.element);
    // 先收起键盘，面板才不会被键盘挡住
    dismissKeyboard();
    openSheetNextTick(() => setContentLinkPreview(target));
  }, [dismissKeyboard, editorRef, openSheetNextTick]);

  const closeContentLinkPreview = useCallback(
    (reason?: "open") => {
      setContentLinkPreview(null);
      const saved = contentLinkPreviewSelectionRef.current;
      contentLinkPreviewSelectionRef.current = null;
      const editor = getEditorFromRef(editorRef);
      if (reason === "open" || !editor) return;
      if (saved) {
        Transforms.select(editor, saved);
      }
      const nextSelection = restoreSelectionAndFocus(editor, saved);
      if (nextSelection) {
        lastSelectionRef.current = nextSelection;
      }
      markSelectionDirty();
    },
    [editorRef, markSelectionDirty]
  );

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

  return useMemo(
    () => ({
      openContentMention,
      pluginInsertItems,
      isEditorFocused,
      isToolbarVisible,
      activePanel,
      panelSelection,
      editingContext,
      dismissEditingContext,
      runTableAction,
      setCodeBlockLanguage,
      getTableColumnAlign,
      isTableMenuOpen,
      openTableMenu,
      closeTableMenu,
      canIndent: true,
      canOutdent: true,
      openPanel,
      togglePanel,
      closePanel,
      dismissKeyboard,
      exitEditing,
      setExitEditingListener,
      setBlockSelectionListener,
      requestBlockSelection,
      focusAfterVoid,
      getEditableElement,
      getEditor,
      runMediaEdit,
      runInPanel,
      indent,
      outdent,
      collapseSelectionToFocus,
      isContentLinkPickerOpen,
      contentLinkPickerIntent,
      retargetContentLink: retargetContentLinkAtCursor,
      contentLinkPreview,
      openContentLinkPreview,
      closeContentLinkPreview,
      executeAction,
      applyHeadingLevel,
      handleSelectInsertItem,
      handleInsertImage,
      applyColorMark,
      applyGradientMark,
      applyHighlightMark,
      applyUnderlineStyle,
      isActionDisabled,
      isActionActive,
      getCurrentBlockKind,
      getCurrentMarks,
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
      openContentMention,
      pluginInsertItems,
      isEditorFocused,
      isToolbarVisible,
      activePanel,
      panelSelection,
      editingContext,
      dismissEditingContext,
      runTableAction,
      setCodeBlockLanguage,
      getTableColumnAlign,
      isTableMenuOpen,
      openTableMenu,
      closeTableMenu,
      openPanel,
      togglePanel,
      closePanel,
      dismissKeyboard,
      exitEditing,
      setExitEditingListener,
      setBlockSelectionListener,
      requestBlockSelection,
      focusAfterVoid,
      getEditableElement,
      getEditor,
      runMediaEdit,
      runInPanel,
      indent,
      outdent,
      collapseSelectionToFocus,
      executeAction,
      applyHeadingLevel,
      applyColorMark,
      applyGradientMark,
      applyHighlightMark,
      applyUnderlineStyle,
      handleCloseContentLinkPicker,
      handleEditorBlur,
      handleEditorFocus,
      handleInsertImage,
      handleSelectContentLink,
      handleSelectInsertItem,
      isActionDisabled,
      isActionActive,
      getCurrentBlockKind,
      getCurrentMarks,
      isContentLinkPickerOpen,
      contentLinkPickerIntent,
      retargetContentLinkAtCursor,
      contentLinkPreview,
      openContentLinkPreview,
      closeContentLinkPreview,
      keepEditorFocus,
      redo,
      syncSelection,
      undo,
    ]
  );
}

export default useMobileEditorToolbarController;
