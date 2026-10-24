import { useEffect, useRef, useState, type ReactNode } from "react";
import { Z_INDEX } from "../../../router/zIndex";
import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  ChevronDown,
  Code,
  Ellipsis,
  FileText,
  Highlighter,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Keyboard,
  KeyboardOff,
  Link2,
  List,
  MessageSquarePlus,
  Plus,
  Sigma,
  SquareCheck,
  Strikethrough,
  Table,
  TextSelect,
  Trash2,
  Underline,
  Undo2,
  Workflow,
  X,
} from "lucide-react";

import {
  resolveExpectedKeyboardHeight,
  resolvePanelHeight,
  useKeyboardViewport,
} from "../../../components/KeyboardViewportProvider";
import { ActionSheet, type ActionSheetItem } from "../../../components/ActionSheet";
import ContentLinkPickerSheet from "../editorExtensions/ContentLinkPickerSheet";
import {
  ALL_CODE_LANGUAGES,
  COMMON_CODE_LANGUAGES,
  focusCodeBlockInput,
  getCodeLanguageLabel,
  getCodeSymbolKeys,
  insertCodeText,
  pressCodeKey,
  type CodeLanguageOption,
  type CodeSymbolKey,
} from "./codeBlockInput";
import type { CodeEditingContext, EditingContext, TableEditingContext } from "./editingContext";
import InsertPanel from "./InsertPanel";
import MediaPanel from "./MediaPanel";
import { useMediaAccessory } from "./mediaAccessory";
import {
  getSourceSymbolKeys,
  insertIntoTextControl,
  insertSourceText,
  type SourceEditingContext,
  type SourceSymbolKey,
} from "./sourceEditorInput";
import StylePanel from "./StylePanel";
import { AccessoryButton, ContextChip, cn, keepEditorFocus } from "./accessoryControls";
import { isTableActionDisabled, type TableActionId } from "./tableActions";
import type { ToolbarActionId } from "./toolbarActions";
import type {
  EditorPanelKind,
  MobileEditorToolbarController,
} from "./useMobileEditorToolbarController";

/** 可裁剪条目 id：配件栏通用 / 格式模式条目、上下文模式开关，及 Aa 面板的「转换为」、颜色、高亮、更多样式条目 */
export type AccessoryItemId =
  | "context-media"
  | "context-table"
  | "context-code"
  | "context-math"
  | "context-mermaid"
  | "plus"
  | "style"
  | "check-list"
  | "bulleted-list"
  | "outdent"
  | "indent"
  | "content-link"
  | "image"
  | "undo"
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "highlight"
  | "link"
  | "comment"
  | "code"
  | "block-paragraph"
  | "block-heading"
  | "block-check-list"
  | "block-bulleted-list"
  | "block-numbered-list"
  | "block-quote"
  | "text-color"
  | "highlight-color"
  | "more-styles";

type FormatItemId = Extract<
  AccessoryItemId,
  "bold" | "italic" | "underline" | "strikethrough" | "highlight" | "link" | "comment" | "code"
>;

type MobileEditorBottomToolbarProps = {
  controller: MobileEditorToolbarController;
  /**
   * 浮层挂载点：默认挂到 document.body（浮层型宿主，如 QuickCaptureSheet）。
   * 页面型宿主传入页面根容器，使工具栏随页面转场动画一起平移、退场，
   * 避免返回时工具栏滞留在上一页之上。
   */
  portalContainer?: HTMLElement | null;
  /**
   * 编辑器当前只读（协作会话冻结/结束、跨端降级等）：只读时工具栏不可用且无意义，
   * 强制退出编辑并收起（只读编辑器仍可获得焦点，须显式抑制，不能只依赖 isToolbarVisible）。
   */
  readonly?: boolean;
  /**
   * 配件栏条目白名单：不传展示全量。传入后通用模式与格式模式都只保留其中的条目，
   * 被过滤为空的分组连分隔线一起收掉。用于闪卡等轻量编辑场景，
   * 白名单应与宿主场景的渲染能力对齐（能编辑的就能渲染）。
   */
  visibleButtons?: ReadonlySet<AccessoryItemId> | null;
};

/** 配件栏高度，同时作为滚动容器的遮挡留白（键盘与面板由外壳收缩避让，不计入） */
const ACCESSORY_BAR_HEIGHT = 46;

const ICON_SIZE = 19;
const ICON_STROKE = 2.2;

/** 通用模式中段条目，按展示顺序 */
const GENERAL_MIDDLE_ITEMS: AccessoryItemId[] = [
  "style",
  "check-list",
  "bulleted-list",
  "outdent",
  "indent",
  "content-link",
  "image",
  "undo",
];

/** 格式模式中段条目，id 与 ToolbarActionId 一致 */
const FORMAT_MIDDLE_ITEMS: FormatItemId[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "highlight",
  "link",
  "comment",
  "code",
];

const ITEM_LABELS: Record<AccessoryItemId, string> = {
  "context-media": "媒体",
  "context-table": "表格",
  "context-code": "代码块",
  "context-math": "公式",
  "context-mermaid": "流程图",
  plus: "插入",
  style: "样式",
  "check-list": "待办",
  "bulleted-list": "无序列表",
  outdent: "反缩进",
  indent: "缩进",
  "content-link": "关联卡片",
  image: "图片",
  undo: "撤销",
  bold: "加粗",
  italic: "斜体",
  underline: "下划线",
  strikethrough: "删除线",
  highlight: "高亮",
  link: "链接",
  comment: "批注",
  code: "行内代码",
  "block-paragraph": "正文",
  "block-heading": "标题",
  "block-check-list": "待办",
  "block-bulleted-list": "无序",
  "block-numbered-list": "编号",
  "block-quote": "引用",
  "text-color": "文字颜色",
  "highlight-color": "高亮颜色",
  "more-styles": "更多文本样式",
};

const ITEM_ICONS: Partial<Record<AccessoryItemId, ReactNode>> = {
  "check-list": <SquareCheck size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  "bulleted-list": <List size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  outdent: <IndentDecrease size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  indent: <IndentIncrease size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  "content-link": <FileText size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  image: <ImageIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  undo: <Undo2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  bold: <Bold size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  italic: <Italic size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  underline: <Underline size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  strikethrough: <Strikethrough size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  highlight: <Highlighter size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  link: <Link2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  comment: <MessageSquarePlus size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  code: <Code size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
};

/** 走 executeAction 的条目及其动作 id */
const ITEM_ACTIONS: Partial<Record<AccessoryItemId, ToolbarActionId>> = {
  "bulleted-list": "bulleted-list",
  "content-link": "content-link",
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strikethrough",
  highlight: "highlight",
  link: "link",
  comment: "comment",
  code: "code",
};

/** 长按 Tab 触发反缩进的时长 */
const CODE_KEY_LONG_PRESS_MS = 450;

type CodeKeyButtonProps = {
  label: string;
  /** 无障碍名称，缺省同 label */
  ariaLabel?: string;
  onPress: () => void;
  /** 提供时按住达到时长即触发，松手后不再触发 onPress */
  onLongPress?: () => void;
};

/** 源码符号键（代码块 / 公式 / 流程图）：等宽字体，多字符键收窄字号并加内边距 */
function CodeKeyButton(props: CodeKeyButtonProps) {
  const { label, ariaLabel, onPress, onLongPress } = props;
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      className={cn(
        "bg-page text-ink-1 active:bg-press mx-0.5 flex h-[34px] min-w-[34px] shrink-0 select-none items-center justify-center rounded-lg font-mono",
        label.length > 1 ? "px-2.5 text-[13px]" : "text-[16px]"
      )}
      onPointerDown={event => {
        event.preventDefault();
        longPressedRef.current = false;
        if (!onLongPress) return;
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          longPressedRef.current = true;
          onLongPress();
        }, CODE_KEY_LONG_PRESS_MS);
      }}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onPointerLeave={clearTimer}
      onMouseDown={keepEditorFocus}
      onContextMenu={keepEditorFocus}
      onClick={() => {
        if (longPressedRef.current) {
          longPressedRef.current = false;
          return;
        }
        onPress();
      }}
    >
      {label}
    </button>
  );
}

type CodeLanguageSheetState = {
  mode: "common" | "all";
  context: CodeEditingContext;
};

const LANGUAGE_MORE_LABEL = "更多语言…";

/** 表格模式中段的文字按钮 */
const TABLE_TEXT_ACTIONS: Array<{ id: TableActionId; label: string }> = [
  { id: "insert-row-below", label: "下方插行" },
  { id: "insert-column-right", label: "右侧插列" },
  { id: "delete-row", label: "删行" },
  { id: "delete-column", label: "删列" },
];

const TABLE_TEXT_BUTTON_CLASS = "px-[9px] text-[13.5px] font-semibold";

const ALIGN_ICONS = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
} as const;

const ALIGN_LABELS = { left: "左对齐", center: "居中", right: "右对齐" } as const;

const MENU_ICON_SIZE = 18;

/** 表格「⋯」菜单：越界的移动项不显示 */
function buildTableMenuItems(
  context: TableEditingContext,
  run: (id: TableActionId) => void
): ActionSheetItem[][] {
  const moveItems: Array<{ id: TableActionId; label: string; icon: ReactNode }> = [
    { id: "move-row-up", label: "上移此行", icon: <ArrowUp size={MENU_ICON_SIZE} /> },
    { id: "move-row-down", label: "下移此行", icon: <ArrowDown size={MENU_ICON_SIZE} /> },
    { id: "move-column-left", label: "左移此列", icon: <ArrowLeft size={MENU_ICON_SIZE} /> },
    { id: "move-column-right", label: "右移此列", icon: <ArrowRight size={MENU_ICON_SIZE} /> },
  ];
  return [
    moveItems
      .filter(item => !isTableActionDisabled(item.id, context))
      .map(item => ({ label: item.label, icon: item.icon, onClick: () => run(item.id) })),
    [
      {
        label: "删除表格",
        icon: <Trash2 size={MENU_ICON_SIZE} />,
        danger: true,
        onClick: () => run("delete-table"),
      },
    ],
  ];
}

/** 语言选项：当前语言带「当前」标记 */
function buildLanguageItems(
  options: CodeLanguageOption[],
  context: CodeEditingContext,
  select: (context: CodeEditingContext, language: string) => void
): ActionSheetItem[] {
  const currentLabel = getCodeLanguageLabel(context.language);
  return options.map(option => ({
    label: option.label,
    trailing: option.label === currentLabel ? "当前" : undefined,
    onClick: () => select(context, option.value),
  }));
}

/** 公式 / 流程图模式：无面板且对应白名单项可见时生效 */
function resolveSourceContext(
  context: EditingContext,
  activePanel: EditorPanelKind | null,
  isVisible: (id: AccessoryItemId) => boolean
): SourceEditingContext | null {
  if (activePanel !== null) return null;
  if (context.kind === "mermaid") return isVisible("context-mermaid") ? context : null;
  if (context.kind === "block-math" || context.kind === "inline-math") {
    return isVisible("context-math") ? context : null;
  }
  return null;
}

export function MobileEditorBottomToolbar(props: MobileEditorBottomToolbarProps) {
  const { controller, portalContainer, readonly = false, visibleButtons } = props;
  const keyboardViewport = useKeyboardViewport();
  const [panelSearching, setPanelSearching] = useState(false);
  const [languageSheet, setLanguageSheet] = useState<CodeLanguageSheetState | null>(null);
  const openAllLanguagesRef = useRef(false);
  const { exitEditing } = controller;

  const portalRoot = portalContainer ?? (typeof document === "undefined" ? null : document.body);
  // 语言选择期间 textarea 可能失焦，配件栏按打开时的代码块上下文保持显示
  const activePanel = readonly ? null : controller.activePanel;
  const { editingContext } = controller;
  const isVisible = (id: AccessoryItemId) => !visibleButtons || visibleButtons.has(id);
  const isFormatMode = editingContext.kind === "selection" && activePanel === null;
  const tableContext =
    editingContext.kind === "table" && activePanel === null && isVisible("context-table")
      ? editingContext
      : null;
  const liveCodeContext =
    editingContext.kind === "code" && activePanel === null && isVisible("context-code")
      ? editingContext
      : null;
  const codeContext = liveCodeContext ?? languageSheet?.context ?? null;
  const sourceContext = resolveSourceContext(editingContext, activePanel, isVisible);
  const mediaContext =
    editingContext.kind === "media" &&
    (activePanel === null || activePanel === "media") &&
    isVisible("context-media")
      ? editingContext
      : null;
  const toggleMediaPanel = () => {
    if (activePanel === "media") controller.closePanel({ showKeyboard: false });
    else controller.openPanel("media", resolvePanelHeight(keyboardViewport));
  };
  const media = useMediaAccessory({ controller, context: mediaContext, toggleMediaPanel });
  // 语言选择 / 媒体菜单期间焦点可能离开编辑器，配件栏按打开时的上下文保持显示
  const showToolbar =
    !readonly && (controller.isToolbarVisible || languageSheet !== null || media.sheetOpen);

  useEffect(() => {
    if (readonly) setLanguageSheet(null);
  }, [readonly]);
  const currentAlign = tableContext ? controller.getTableColumnAlign() : null;
  useEffect(() => {
    if (activePanel !== "insert") setPanelSearching(false);
  }, [activePanel]);

  useEffect(() => {
    if (readonly && controller.isToolbarVisible) {
      exitEditing();
    }
  }, [controller.isToolbarVisible, exitEditing, readonly]);

  // 工具条可见时把自身占位高度写到根变量，所在页面的滚动容器据此留白；隐藏时不占位
  useEffect(() => {
    const root = document.documentElement;
    if (!showToolbar) {
      root.style.removeProperty("--mobile-editor-toolbar-occlusion");
      return;
    }
    root.style.setProperty("--mobile-editor-toolbar-occlusion", `${ACCESSORY_BAR_HEIGHT}px`);
    return () => {
      root.style.removeProperty("--mobile-editor-toolbar-occlusion");
    };
  }, [showToolbar]);

  const returnToKeyboard = () => {
    controller.closePanel({ showKeyboard: true, restoreSelection: true });
  };

  // 媒体面板打开时键盘本就收起，返回只关面板
  useSheetBackDismiss(activePanel !== null, () => {
    if (activePanel === "media") controller.closePanel({ showKeyboard: false });
    else returnToKeyboard();
  });

  const togglePanel = (kind: EditorPanelKind) => {
    controller.togglePanel(kind, resolvePanelHeight(keyboardViewport));
  };

  const pressItem = (id: AccessoryItemId) => {
    const actionId = ITEM_ACTIONS[id];
    if (actionId) {
      controller.executeAction(actionId);
      return;
    }
    switch (id) {
      case "plus":
        togglePanel("insert");
        break;
      case "style":
        togglePanel("style");
        break;
      case "check-list":
        controller.handleSelectInsertItem("check-list");
        break;
      case "outdent":
        controller.outdent();
        break;
      case "indent":
        controller.indent();
        break;
      case "image":
        controller.handleInsertImage();
        break;
      case "undo":
        controller.undo();
        break;
    }
  };

  const isItemDisabled = (id: AccessoryItemId) => {
    const actionId = ITEM_ACTIONS[id];
    if (actionId) return controller.isActionDisabled(actionId);
    if (id === "indent") return !controller.canIndent;
    if (id === "outdent") return !controller.canOutdent;
    return false;
  };

  const isItemActive = (id: AccessoryItemId) => {
    if (id === "style") return activePanel === "style";
    const actionId = ITEM_ACTIONS[id];
    return actionId ? controller.isActionActive(actionId) : false;
  };

  const renderItem = (id: AccessoryItemId) => {
    if (id === "style") {
      return (
        <AccessoryButton
          key={id}
          label={ITEM_LABELS.style}
          active={isItemActive(id)}
          className="px-[9px] text-[13.5px] font-semibold"
          onPress={() => pressItem(id)}
        >
          Aa
        </AccessoryButton>
      );
    }
    return (
      <AccessoryButton
        key={id}
        label={ITEM_LABELS[id]}
        active={isItemActive(id)}
        disabled={isItemDisabled(id)}
        onPress={() => pressItem(id)}
      >
        {ITEM_ICONS[id]}
      </AccessoryButton>
    );
  };

  const renderTableItems = (context: TableEditingContext) => {
    const AlignIcon = ALIGN_ICONS[currentAlign ?? "left"];
    return [
      ...TABLE_TEXT_ACTIONS.map(action => (
        <AccessoryButton
          key={action.id}
          label={action.label}
          disabled={isTableActionDisabled(action.id, context)}
          className={TABLE_TEXT_BUTTON_CLASS}
          onPress={() => controller.runTableAction(action.id)}
        >
          {action.label}
        </AccessoryButton>
      )),
      <AccessoryButton
        key="cycle-align"
        label={`对齐：${ALIGN_LABELS[currentAlign ?? "left"]}`}
        active={currentAlign !== null}
        onPress={() => controller.runTableAction("cycle-align")}
      >
        <AlignIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </AccessoryButton>,
    ];
  };

  const pressCodeSymbol = (context: CodeEditingContext, symbol: CodeSymbolKey) => {
    const { textarea } = context;
    if (symbol.kind === "tab") pressCodeKey(textarea, "Tab");
    else if (symbol.kind === "key") pressCodeKey(textarea, symbol.key);
    else insertCodeText(textarea, symbol.text);
  };

  const renderCodeItems = (context: CodeEditingContext) =>
    getCodeSymbolKeys(context.language).map(symbol => (
      <CodeKeyButton
        key={symbol.label}
        label={symbol.label}
        onPress={() => pressCodeSymbol(context, symbol)}
        onLongPress={
          symbol.kind === "tab"
            ? () => pressCodeKey(context.textarea, "Tab", { shiftKey: true })
            : undefined
        }
      />
    ));

  const openLanguageSheet = (context: CodeEditingContext) => {
    // 下一拍再打开，避免本次点击落到 Sheet 遮罩上
    window.setTimeout(() => setLanguageSheet({ mode: "common", context }), 0);
  };

  const closeCodeKeyboard = (context: CodeEditingContext) => {
    context.textarea.blur();
    exitEditing();
  };

  const pressSourceSymbol = (context: SourceEditingContext, symbol: SourceSymbolKey) => {
    if (context.kind === "inline-math") {
      insertIntoTextControl(context.input, symbol.text, symbol.cursorOffset);
    } else {
      insertSourceText(context.host, symbol.text, { cursorOffset: symbol.cursorOffset });
    }
  };

  const renderSourceItems = (context: SourceEditingContext) =>
    getSourceSymbolKeys(context.kind).map(symbol => (
      <CodeKeyButton
        key={symbol.label}
        label={symbol.label}
        ariaLabel={symbol.ariaLabel}
        onPress={() => pressSourceSymbol(context, symbol)}
      />
    ));

  const closeSourceKeyboard = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    exitEditing();
  };

  let middleNodes: ReactNode[];
  if (codeContext) middleNodes = renderCodeItems(codeContext);
  else if (sourceContext) middleNodes = renderSourceItems(sourceContext);
  else if (mediaContext) middleNodes = media.middleNodes;
  else if (tableContext) middleNodes = renderTableItems(tableContext);
  else {
    middleNodes = (isFormatMode ? FORMAT_MIDDLE_ITEMS : GENERAL_MIDDLE_ITEMS)
      .filter(isVisible)
      .map(renderItem);
  }

  let leftNode: ReactNode = null;
  if (codeContext) {
    const languageLabel = getCodeLanguageLabel(codeContext.language);
    leftNode = (
      <ContextChip
        label={languageLabel}
        ariaLabel={`代码语言：${languageLabel}`}
        trailing={<ChevronDown size={13} strokeWidth={ICON_STROKE} className="shrink-0" />}
        onPress={() => openLanguageSheet(codeContext)}
      />
    );
  } else if (sourceContext) {
    const isMermaid = sourceContext.kind === "mermaid";
    const SourceIcon = isMermaid ? Workflow : Sigma;
    leftNode = (
      <ContextChip
        icon={<SourceIcon size={14} strokeWidth={ICON_STROKE} />}
        label={ITEM_LABELS[isMermaid ? "context-mermaid" : "context-math"]}
      />
    );
  } else if (mediaContext) {
    leftNode = media.leftNode;
  } else if (isFormatMode) {
    leftNode = (
      <ContextChip
        icon={<TextSelect size={14} strokeWidth={ICON_STROKE} />}
        label="格式"
        onPress={controller.collapseSelectionToFocus}
      />
    );
  } else if (tableContext) {
    leftNode = (
      <ContextChip
        icon={<Table size={14} strokeWidth={ICON_STROKE} />}
        label={ITEM_LABELS["context-table"]}
        onPress={controller.dismissEditingContext}
      />
    );
  } else if (isVisible("plus")) {
    const insertOpen = activePanel === "insert";
    leftNode = (
      <button
        type="button"
        aria-label={insertOpen ? "关闭插入面板" : "插入"}
        className={cn(
          "text-ink-inverse mx-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] transition-colors",
          insertOpen ? "bg-ink-1" : "bg-accent"
        )}
        onPointerDown={keepEditorFocus}
        onMouseDown={keepEditorFocus}
        onClick={() => pressItem("plus")}
      >
        {insertOpen ? (
          <X size={20} strokeWidth={ICON_STROKE} />
        ) : (
          <Plus size={20} strokeWidth={ICON_STROKE} />
        )}
      </button>
    );
  }

  let rightNode: ReactNode;
  if (codeContext) {
    rightNode = (
      <AccessoryButton label="收起键盘" onPress={() => closeCodeKeyboard(codeContext)}>
        <KeyboardOff size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </AccessoryButton>
    );
  } else if (sourceContext) {
    rightNode = (
      <AccessoryButton label="收起键盘" onPress={closeSourceKeyboard}>
        <KeyboardOff size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </AccessoryButton>
    );
  } else if (mediaContext) {
    rightNode = media.rightNode;
  } else if (isFormatMode) {
    rightNode = isVisible("style") ? renderItem("style") : null;
  } else if (tableContext) {
    rightNode = (
      <AccessoryButton label="表格菜单" onPress={controller.openTableMenu}>
        <Ellipsis size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </AccessoryButton>
    );
  } else if (activePanel) {
    rightNode = (
      <AccessoryButton label="键盘" onPress={returnToKeyboard}>
        <Keyboard size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </AccessoryButton>
    );
  } else {
    rightNode = (
      <AccessoryButton label="收起键盘" onPress={exitEditing}>
        <KeyboardOff size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </AccessoryButton>
    );
  }

  const selectLanguage = (context: CodeEditingContext, language: string) => {
    controller.setCodeBlockLanguage(context, language);
    // 在选项点击内同步聚焦，iOS 才会弹回键盘
    focusCodeBlockInput(context);
  };

  const closeLanguageSheet = () => {
    const current = languageSheet;
    if (!current) return;
    if (current.mode === "common" && openAllLanguagesRef.current) {
      openAllLanguagesRef.current = false;
      setLanguageSheet({ mode: "all", context: current.context });
      return;
    }
    openAllLanguagesRef.current = false;
    setLanguageSheet(null);
    focusCodeBlockInput(current.context);
  };

  const toolbarNode =
    showToolbar && portalRoot
      ? createPortal(
          <nav
            data-mobile-editor-toolbar="true"
            className="bg-surface border-line-1 fixed inset-x-0 flex h-[46px] items-center gap-0.5 border-t px-1"
            style={{
              zIndex: Z_INDEX.POPOVER,
              bottom: "var(--mobile-overlay-bottom)",
            }}
          >
            {leftNode}
            <div className="relative flex min-w-0 flex-1 items-center">
              <div className="scrollbar-hide flex flex-1 items-center overflow-x-auto">
                {middleNodes}
              </div>
              {/* 右侧渐隐：提示可横向滚动 */}
              <div
                aria-hidden="true"
                className="bg-linear-to-r to-surface pointer-events-none absolute inset-y-0 right-0 w-[22px] from-transparent"
              />
            </div>
            {middleNodes.length > 0 && rightNode ? (
              <span aria-hidden="true" className="bg-line-1 mx-1 h-[22px] w-px shrink-0" />
            ) : null}
            {rightNode}
          </nav>,
          portalRoot
        )
      : null;

  // 插入面板搜索时键盘在面板下方，面板从键盘顶边起算
  // 键盘升起前按预计高度先把面板抬到键盘位置之上：搜索框聚焦时已可见，iOS 不会为露出它平移整个视口
  const panelBottom = panelSearching ? resolveExpectedKeyboardHeight(keyboardViewport) : 0;
  const panelNode =
    activePanel && portalRoot
      ? createPortal(
          // 面板自行贴住键盘定位，内部输入框（插入面板搜索）不参与自动露出，否则会被卷到上方工具条下
          <div
            data-mobile-editor-panel={activePanel}
            data-kb-optout="true"
            className="bg-surface fixed inset-x-0"
            style={{
              zIndex: Z_INDEX.POPOVER,
              bottom: panelBottom,
              height: Math.max(0, keyboardViewport.reservedHeight - panelBottom),
            }}
          >
            <div className="h-full overflow-y-auto pb-[var(--mobile-safe-bottom)]">
              <div data-testid={`editor-panel-${activePanel}`}>
                {activePanel === "style" ? (
                  <StylePanel controller={controller} visibleButtons={visibleButtons} />
                ) : activePanel === "media" ? (
                  mediaContext ? (
                    <MediaPanel controller={controller} context={mediaContext} />
                  ) : null
                ) : (
                  <InsertPanel controller={controller} onSearchingChange={setPanelSearching} />
                )}
              </div>
            </div>
          </div>,
          portalRoot
        )
      : null;

  return (
    <>
      {toolbarNode}
      {panelNode}
      <ActionSheet
        open={controller.isTableMenuOpen}
        title="表格"
        groups={
          editingContext.kind === "table"
            ? buildTableMenuItems(editingContext, controller.runTableAction)
            : []
        }
        onClose={controller.closeTableMenu}
      />
      <ActionSheet
        open={languageSheet?.mode === "common"}
        title="代码语言"
        groups={
          languageSheet
            ? [
                buildLanguageItems(COMMON_CODE_LANGUAGES, languageSheet.context, selectLanguage),
                [
                  {
                    label: LANGUAGE_MORE_LABEL,
                    onClick: () => {
                      openAllLanguagesRef.current = true;
                    },
                  },
                ],
              ]
            : []
        }
        onClose={closeLanguageSheet}
      />
      <ActionSheet
        open={languageSheet?.mode === "all"}
        title="全部语言"
        groups={
          languageSheet
            ? [buildLanguageItems(ALL_CODE_LANGUAGES, languageSheet.context, selectLanguage)]
            : []
        }
        onClose={closeLanguageSheet}
      />
      {media.sheets}
      <ContentLinkPickerSheet
        open={controller.isContentLinkPickerOpen}
        onClose={controller.handleCloseContentLinkPicker}
        onSelect={controller.handleSelectContentLink}
      />
    </>
  );
}

export default MobileEditorBottomToolbar;
