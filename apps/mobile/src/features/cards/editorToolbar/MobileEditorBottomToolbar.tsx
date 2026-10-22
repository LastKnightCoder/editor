import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { Z_INDEX } from "../../../router/zIndex";
import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import { createPortal } from "react-dom";
import {
  Bold,
  Code,
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
  SquareCheck,
  Strikethrough,
  TextSelect,
  Underline,
  Undo2,
  X,
} from "lucide-react";

import {
  resolvePanelHeight,
  useKeyboardViewport,
} from "../../../components/KeyboardViewportProvider";
import ContentLinkPickerSheet from "../editorExtensions/ContentLinkPickerSheet";
import InsertPanel from "./InsertPanel";
import StylePanel from "./StylePanel";
import type { ToolbarActionId } from "./toolbarActions";
import type {
  EditorPanelKind,
  MobileEditorToolbarController,
} from "./useMobileEditorToolbarController";

/** 可裁剪条目 id：配件栏通用 / 格式模式条目，及 Aa 面板的「转换为」、颜色、高亮、更多样式条目 */
export type AccessoryItemId =
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

/** 配件栏高度，同时作为滚动容器的遮挡留白（键盘与面板高度已含在 --kb-height） */
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

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/** 按下时阻止按钮抢走编辑器焦点（键盘不因触按而收起） */
function keepEditorFocus(event: SyntheticEvent) {
  event.preventDefault();
}

type AccessoryButtonProps = {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  /** 宽度与文字排版，默认 w-10 方形按钮 */
  className?: string;
  children: ReactNode;
};

function AccessoryButton(props: AccessoryButtonProps) {
  const { label, onPress, active = false, disabled = false, className, children } = props;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "flex h-10 shrink-0 items-center justify-center rounded-[11px] transition-colors",
        active ? "bg-accent-soft text-accent-text" : "text-ink-2 active:bg-press",
        disabled && "opacity-40",
        className ?? "w-10"
      )}
      onPointerDown={keepEditorFocus}
      onMouseDown={keepEditorFocus}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

export function MobileEditorBottomToolbar(props: MobileEditorBottomToolbarProps) {
  const { controller, portalContainer, readonly = false, visibleButtons } = props;
  const keyboardViewport = useKeyboardViewport();
  const [panelSearching, setPanelSearching] = useState(false);
  const { exitEditing } = controller;

  const portalRoot = portalContainer ?? (typeof document === "undefined" ? null : document.body);
  const showToolbar = !readonly && controller.isToolbarVisible;
  const activePanel = readonly ? null : controller.activePanel;
  const isFormatMode = controller.hasExpandedSelection && activePanel === null;
  useEffect(() => {
    if (activePanel !== "insert") setPanelSearching(false);
  }, [activePanel]);

  const isVisible = (id: AccessoryItemId) => !visibleButtons || visibleButtons.has(id);

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

  useSheetBackDismiss(activePanel !== null, returnToKeyboard);

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

  const middleItems = (isFormatMode ? FORMAT_MIDDLE_ITEMS : GENERAL_MIDDLE_ITEMS).filter(isVisible);

  let leftNode: ReactNode = null;
  if (isFormatMode) {
    leftNode = (
      <button
        type="button"
        className="bg-accent-soft text-accent-text mx-1 flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] font-semibold"
        onPointerDown={keepEditorFocus}
        onMouseDown={keepEditorFocus}
        onClick={controller.collapseSelectionToFocus}
      >
        <TextSelect size={14} strokeWidth={ICON_STROKE} />
        格式
      </button>
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
  if (isFormatMode) {
    rightNode = isVisible("style") ? renderItem("style") : null;
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

  const toolbarNode =
    showToolbar && portalRoot
      ? createPortal(
          <nav
            data-mobile-editor-toolbar="true"
            className="bg-surface border-line-1 fixed inset-x-0 flex h-[46px] items-center gap-0.5 border-t px-1"
            style={{
              zIndex: Z_INDEX.POPOVER,
              bottom: "max(var(--kb-height, 0px), env(safe-area-inset-bottom, 0px))",
            }}
          >
            {leftNode}
            <div className="relative flex min-w-0 flex-1 items-center">
              <div className="scrollbar-hide flex flex-1 items-center overflow-x-auto">
                {middleItems.map(renderItem)}
              </div>
              {/* 右侧渐隐：提示可横向滚动 */}
              <div
                aria-hidden="true"
                className="bg-linear-to-r to-surface pointer-events-none absolute inset-y-0 right-0 w-[22px] from-transparent"
              />
            </div>
            {middleItems.length > 0 && rightNode ? (
              <span aria-hidden="true" className="bg-line-1 mx-1 h-[22px] w-px shrink-0" />
            ) : null}
            {rightNode}
          </nav>,
          portalRoot
        )
      : null;

  // 插入面板搜索时键盘在面板下方，面板从键盘顶边起算
  const panelBottom = panelSearching ? keyboardViewport.rawKeyboardHeight : 0;
  const panelNode =
    activePanel && portalRoot
      ? createPortal(
          <div
            data-mobile-editor-panel={activePanel}
            className="bg-surface fixed inset-x-0"
            style={{
              zIndex: Z_INDEX.POPOVER,
              bottom: panelBottom,
              height: Math.max(0, keyboardViewport.reservedHeight - panelBottom),
            }}
          >
            <div className="h-full overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <div data-testid={`editor-panel-${activePanel}`}>
                {activePanel === "style" ? (
                  <StylePanel controller={controller} visibleButtons={visibleButtons} />
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
      <ContentLinkPickerSheet
        open={controller.isContentLinkPickerOpen}
        onClose={controller.handleCloseContentLinkPicker}
        onSelect={controller.handleSelectContentLink}
      />
    </>
  );
}

export default MobileEditorBottomToolbar;
