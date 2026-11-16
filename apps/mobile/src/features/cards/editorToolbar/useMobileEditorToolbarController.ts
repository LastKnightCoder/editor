import type { IBlockPanelListItem } from "@tau/editor/api";
import { useCallback, useMemo, type RefObject } from "react";
import type { EditorRef } from "@tau/editor";
import type { TableAlign } from "@tau/editor/extensions/table";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  type BaseSelection,
  type Path,
} from "slate";

import { useKeyboardReservation } from "../../../components/KeyboardViewportProvider";
import type { ContentLinkPickerResult } from "../editorExtensions/ContentLinkPickerSheet";
import type {
  ContentLinkPickerIntent,
  ContentLinkTarget,
} from "../editorExtensions/contentLinkModel";
import type { ContentMentionRequest } from "../editorExtensions/useContentMention";
import {
  type CurrentBlockKind,
  type ToolbarActionId,
  type TextGradientOption,
  type UnderlineStylePayload,
} from "./toolbarActions";
import type { EditingContext, CodeEditingContext } from "./editingContext";
import type { RecordingPersistence } from "../recording/recordingPersistence";
import type { TtsInsertIntent, TtsInsertTarget } from "../tts/ttsInsertTarget";
import type { TableActionId } from "./tableActions";
import { useToolbarSelectionState } from "./useToolbarSelectionState";
import { useToolbarPanels } from "./useToolbarPanels";
import { useContentLinkController } from "./useContentLinkController";
import { useToolbarActions } from "./useToolbarActions";
import { useToolbarInsert } from "./useToolbarInsert";
import { useTtsActions } from "./useTtsActions";
import { useRecordingActions } from "./useRecordingActions";
import { useTableMenuController } from "./useTableMenuController";
import { useToolbarFocusLifecycle } from "./useToolbarFocusLifecycle";
import { useToolbarVisibility } from "./useToolbarVisibility";
import { useToolbarSelectionQueries } from "./useToolbarSelectionQueries";

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
  | "content-link"
  | "tts"
  | "record";

/** 占用键盘位置的面板：Aa 样式面板 / + 插入面板 / 媒体尺寸面板（选中媒体时，键盘已收起）/ 语音面板 */
export type EditorPanelKind = "style" | "insert" | "media" | "voice";

export type ClosePanelOptions = {
  /** 是否弹回键盘；用户点正文时键盘由系统弹出，传 false */
  showKeyboard: boolean;
  /** 弹回键盘时是否恢复面板保存的选区，默认 false */
  restoreSelection?: boolean;
};

/** 宿主页开启录音：录音与文档绑定（离开确认、找回都按文档），所以由能确定文档身份的页面声明 */
export type EditorRecordingHost = {
  /** 文档 key，如 `content:12` */
  document: () => string | null;
  /** 面板里显示的文档名 */
  documentTitle: () => string;
  persistence: () => RecordingPersistence;
};

type UseMobileEditorToolbarControllerOptions = {
  editorRef: RefObject<EditorRef | null>;
  recording?: EditorRecordingHost;
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
  /** 文字转语音面板锁定的写入位置，面板关闭时为 null */
  ttsTarget: TtsInsertTarget | null;
  /** 选中文字转语音：预填选中内容，生成后插在选区所在块之后 */
  openTtsForSelection: () => void;
  /** 已有音频重新生成 / 用文字替换：原地改写该音频块 */
  openTtsForAudio: (element: SlateElement, path: Path, text: string) => void;
  closeTts: () => void;
  /** 写入成功：关闭面板、光标落到新内容后，并给出可撤销提示 */
  handleTtsInserted: (kind: TtsInsertIntent["kind"]) => void;
  /** 宿主开启了录音（插入面板显示「录音」） */
  recordingEnabled: boolean;
  /** 重新录制：录完原地换掉这个音频块的音频 */
  rerecordAudio: (element: SlateElement, path: Path) => void;
  /** 麦克风权限被拒，提示去系统设置 */
  recordingPermissionDenied: boolean;
  closeRecordingPermission: () => void;
};

/** 移动端编辑器工具栏控制器：组装层，按域委托给同目录子 hook（选区状态、面板、内容链接、
 *  格式化命令、插入、TTS、录音、表格、焦点生命周期、可见性、选区查询） */
export function useMobileEditorToolbarController(
  options: UseMobileEditorToolbarControllerOptions
): MobileEditorToolbarController {
  const { editorRef, recording: recordingHost } = options;
  const reservation = useKeyboardReservation();

  /** 工具条按钮经 pointerdown 触发，底部面板须延迟一拍挂载：
   *  面板若在当前 tap 结束前 mount，全屏遮罩会接管手势结束时的 hit-test，
   *  Android WebView 把残余 click 派发到遮罩 → 面板秒关甚至编辑器失焦 */
  const openSheetNextTick = useCallback((open: () => void) => {
    window.setTimeout(open, 0);
  }, []);

  const {
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
  } = useToolbarSelectionState({ editorRef });

  const { activePanel, openPanel, togglePanel, closePanel, dismissKeyboard } = useToolbarPanels({
    editorRef,
    reservation,
    getEditableElement,
    markSelectionDirty,
    activePanelRef,
    panelSelectionRef,
    rememberPanelSelection,
    lastSelectionRef,
  });

  const {
    isContentLinkPickerOpen,
    contentLinkPickerIntent,
    contentLinkPreview,
    mentionRef,
    pendingContentLinkSelectionRef,
    contentLinkRetargetPathRef,
    setIsContentLinkPickerOpen,
    setContentLinkPickerIntent,
    openContentMention,
    handleCloseContentLinkPicker,
    handleSelectContentLink,
    retargetContentLinkAtCursor,
    openContentLinkPreview,
    closeContentLinkPreview,
  } = useContentLinkController({
    editorRef,
    openSheetNextTick,
    markSelectionDirty,
    restoreEditorSelection,
    dismissKeyboard,
    lastSelectionRef,
  });

  const {
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
  } = useToolbarActions({
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
  });

  const { ttsTarget, openTts, openTtsForSelection, openTtsForAudio, closeTts, handleTtsInserted } =
    useTtsActions({
      editorRef,
      openSheetNextTick,
      dismissKeyboard,
      markSelectionDirty,
      lastSelectionRef,
      undoRef,
    });

  const {
    recordingEnabled,
    startRecording,
    rerecordAudio,
    recordingPermissionDenied,
    closeRecordingPermission,
  } = useRecordingActions({ editorRef, recordingHost });

  const { handleSelectInsertItem, handleInsertImage, pluginInsertItems } = useToolbarInsert({
    editorRef,
    activePanel,
    restoreEditorSelection,
    markSelectionDirty,
    lastSelectionRef,
    executeAction,
    openTts,
    startRecording,
  });

  const {
    isTableMenuOpen,
    runTableAction,
    setCodeBlockLanguage,
    getTableColumnAlign,
    openTableMenu,
    closeTableMenu,
  } = useTableMenuController({
    editorRef,
    openSheetNextTick,
    markSelectionDirty,
    restoreEditorSelection,
    selectionVersion,
    lastSelectionRef,
    tableMenuOpenRef,
    tableMenuSelectionRef,
  });

  const {
    isEditorFocused,
    keepEditorFocus,
    handleEditorFocus,
    handleEditorBlur,
    exitEditing,
    setExitEditingListener,
    setBlockSelectionListener,
    requestBlockSelection,
  } = useToolbarFocusLifecycle({
    editorRef,
    closePanel,
    dismissKeyboard,
    markSelectionDirty,
    restoreEditorSelection,
    lastSelectionRef,
    activePanelRef,
  });

  const { editingContext, dismissEditingContext, isToolbarVisible, focusAfterVoid, runMediaEdit } =
    useToolbarVisibility({
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
    });

  const { isActionDisabled, isActionActive, getCurrentBlockKind, getCurrentMarks } =
    useToolbarSelectionQueries({
      editorRef,
      selectionVersion,
      activePanel,
      panelSelection,
    });

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
      ttsTarget,
      openTtsForSelection,
      openTtsForAudio,
      closeTts,
      handleTtsInserted,
      recordingEnabled,
      rerecordAudio,
      recordingPermissionDenied,
      closeRecordingPermission,
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
      ttsTarget,
      openTtsForSelection,
      openTtsForAudio,
      closeTts,
      handleTtsInserted,
      recordingEnabled,
      rerecordAudio,
      recordingPermissionDenied,
      closeRecordingPermission,
    ]
  );
}

export default useMobileEditorToolbarController;
