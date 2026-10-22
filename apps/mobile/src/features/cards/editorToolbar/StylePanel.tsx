import { useState, type ReactNode, type SyntheticEvent } from "react";
import {
  Bold,
  ChevronLeft,
  ChevronRight,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquarePlus,
  Quote,
  SquareCheck,
  Strikethrough,
  Underline,
  X,
} from "lucide-react";
import { useThemeStore } from "@tau/themes/react";

import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import type { AccessoryItemId } from "./MobileEditorBottomToolbar";
import {
  HIGHLIGHT_OPTIONS,
  TEXT_COLOR_OPTIONS,
  TEXT_GRADIENT_OPTIONS,
  UNDERLINE_COLOR_OPTIONS,
  UNDERLINE_LINE_TYPE_OPTIONS,
  type CurrentBlockKind,
  type ToolbarActionId,
  type UnderlineColor,
  type UnderlineLineType,
  type UnderlineStylePayload,
} from "./toolbarActions";
import type { MobileEditorToolbarController } from "./useMobileEditorToolbarController";

type StylePanelProps = {
  controller: MobileEditorToolbarController;
  /** 条目白名单，与配件栏共用；不传展示全量 */
  visibleButtons?: ReadonlySet<AccessoryItemId> | null;
};

type BlockOption = {
  /** 白名单 id；H1/H2/H3 共用 block-heading */
  itemId: AccessoryItemId;
  kind: Exclude<CurrentBlockKind, "other">;
  /** 无障碍名称 */
  label: string;
  preview: ReactNode;
  caption?: string;
};

type InlineOption = {
  id: Extract<
    ToolbarActionId,
    "bold" | "italic" | "underline" | "strikethrough" | "code" | "link" | "comment"
  >;
  label: string;
  icon: ReactNode;
};

type UnderlinePaletteState = {
  color: UnderlineColor;
  lineType: UnderlineLineType;
};

const ICON_SIZE = 18;
const ICON_STROKE = 2.2;

const DEFAULT_UNDERLINE_PALETTE: UnderlinePaletteState = {
  color: "red",
  lineType: "solid",
};

const BLOCK_OPTIONS: BlockOption[] = [
  {
    itemId: "block-paragraph",
    kind: "paragraph",
    label: "正文",
    preview: <span className="text-ink-1 text-[15px] leading-tight">正文</span>,
  },
  {
    itemId: "block-heading",
    kind: "h1",
    label: "一级标题",
    preview: <span className="text-ink-1 text-[17px] font-extrabold leading-tight">标题</span>,
    caption: "H1",
  },
  {
    itemId: "block-heading",
    kind: "h2",
    label: "二级标题",
    preview: <span className="text-ink-1 text-[15px] font-bold leading-tight">标题</span>,
    caption: "H2",
  },
  {
    itemId: "block-heading",
    kind: "h3",
    label: "三级标题",
    preview: <span className="text-ink-1 text-[13px] font-bold leading-tight">标题</span>,
    caption: "H3",
  },
  {
    itemId: "block-check-list",
    kind: "check-list",
    label: "待办",
    preview: <SquareCheck size={ICON_SIZE} strokeWidth={ICON_STROKE} className="text-ink-1" />,
    caption: "待办",
  },
  {
    itemId: "block-bulleted-list",
    kind: "bulleted-list",
    label: "无序列表",
    preview: <List size={ICON_SIZE} strokeWidth={ICON_STROKE} className="text-ink-1" />,
    caption: "无序",
  },
  {
    itemId: "block-numbered-list",
    kind: "numbered-list",
    label: "编号列表",
    preview: <ListOrdered size={ICON_SIZE} strokeWidth={ICON_STROKE} className="text-ink-1" />,
    caption: "编号",
  },
  {
    itemId: "block-quote",
    kind: "quote",
    label: "引用",
    preview: <Quote size={ICON_SIZE} strokeWidth={ICON_STROKE} className="text-ink-1" />,
    caption: "引用",
  },
];

const INLINE_MARK_OPTIONS: InlineOption[] = [
  { id: "bold", label: "加粗", icon: <Bold size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "italic", label: "斜体", icon: <Italic size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  {
    id: "underline",
    label: "下划线",
    icon: <Underline size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    id: "strikethrough",
    label: "删除线",
    icon: <Strikethrough size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  { id: "code", label: "行内代码", icon: <Code size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
];

const INLINE_POPUP_OPTIONS: InlineOption[] = [
  { id: "link", label: "链接", icon: <Link2 size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  {
    id: "comment",
    label: "批注",
    icon: <MessageSquarePlus size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
];

/** 链接与批注会弹出带输入框的浮层并锚定选区，须先回到键盘态再执行 */
const POPUP_ACTIONS = new Set<ToolbarActionId>(["link", "comment"]);

/** 列表 / 引用块的解除动作：对同类型再 toggle 一次即解除 */
const CONTAINER_TOGGLE_ACTIONS: Partial<Record<CurrentBlockKind, ToolbarActionId>> = {
  "bulleted-list": "bulleted-list",
  "numbered-list": "numbered-list",
  quote: "quote",
};

const HEADING_LEVELS: Partial<Record<CurrentBlockKind, 1 | 2 | 3>> = { h1: 1, h2: 2, h3: 3 };

const SWATCH_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold";
const SWATCH_SELECTED_CLASS = "ring-2 ring-accent ring-offset-2 ring-offset-surface";

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/** 按下时阻止按钮抢走焦点，动作在 click 执行 */
function preventFocusSteal(event: SyntheticEvent) {
  event.preventDefault();
}

const pressHandlers = {
  onPointerDown: preventFocusSteal,
  onMouseDown: preventFocusSteal,
};

function readUnderlinePaletteState(): UnderlinePaletteState {
  if (typeof window === "undefined") {
    return DEFAULT_UNDERLINE_PALETTE;
  }
  const storedColor = localStorage.getItem("underline-color");
  const storedLineType = localStorage.getItem("underline-line-type");
  const color = UNDERLINE_COLOR_OPTIONS.some(item => item.value === storedColor)
    ? (storedColor as UnderlineColor)
    : DEFAULT_UNDERLINE_PALETTE.color;
  const lineType = UNDERLINE_LINE_TYPE_OPTIONS.some(item => item.value === storedLineType)
    ? (storedLineType as UnderlineLineType)
    : DEFAULT_UNDERLINE_PALETTE.lineType;
  return { color, lineType };
}

function GroupTitle(props: { children: ReactNode }) {
  return <div className="text-ink-3 mb-[7px] text-[11.5px]">{props.children}</div>;
}

function SwatchRow(props: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex items-center gap-[9px]", props.className ?? "mb-[9px]")}>
      <span className="text-ink-3 w-[26px] shrink-0 text-[11.5px]">{props.label}</span>
      <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-[9px] overflow-x-auto p-1">
        {props.children}
      </div>
    </div>
  );
}

function SegmentButton(props: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { label, active, disabled, onPress, children } = props;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "flex h-[38px] min-w-10 flex-1 items-center justify-center rounded-[9px] transition-colors",
        active ? "bg-surface text-accent-text shadow-lift" : "text-ink-1",
        disabled && "opacity-40"
      )}
      {...pressHandlers}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

function TextButton(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { label, active = false, disabled = false, onPress } = props;
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "h-[38px] rounded-[9px] px-3.5 text-[13.5px] transition-colors",
        active ? "bg-accent-soft text-accent-text" : "bg-page text-ink-1",
        disabled && "opacity-40"
      )}
      {...pressHandlers}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

export function StylePanel(props: StylePanelProps) {
  const { controller, visibleButtons } = props;
  const [view, setView] = useState<"main" | "more">("main");
  const [underlinePalette, setUnderlinePalette] = useState(readUnderlinePaletteState);
  const isDark = useThemeStore(state => state.mode === "dark");

  // 二级视图晚于面板注册，LIFO 下系统返回先回一级
  useSheetBackDismiss(view === "more", () => setView("main"));

  const isVisible = (id: AccessoryItemId) => !visibleButtons || visibleButtons.has(id);

  const currentBlockKind = controller.getCurrentBlockKind();
  const marks = controller.getCurrentMarks();

  const runInlineAction = (actionId: ToolbarActionId) => {
    if (POPUP_ACTIONS.has(actionId)) {
      controller.closePanel({ showKeyboard: true, restoreSelection: true });
    }
    controller.executeAction(actionId);
  };

  const convertBlock = (target: BlockOption["kind"]) => {
    if (target === "check-list") {
      if (currentBlockKind !== "check-list") {
        controller.handleSelectInsertItem("check-list");
      }
      return;
    }
    if (target === "bulleted-list" || target === "numbered-list" || target === "quote") {
      controller.executeAction(target);
      return;
    }
    const leaveAction = CONTAINER_TOGGLE_ACTIONS[currentBlockKind];
    if (leaveAction) {
      controller.executeAction(leaveAction);
    }
    controller.applyHeadingLevel(HEADING_LEVELS[target] ?? "paragraph");
  };

  const applyUnderline = (payload: UnderlineStylePayload) => {
    setUnderlinePalette(state => ({ ...state, ...payload }));
    controller.applyUnderlineStyle(payload);
  };

  const renderInlineGroup = (options: InlineOption[], className: string) => {
    const visible = options.filter(option => isVisible(option.id));
    if (visible.length === 0) return null;
    return (
      <div className={cn("bg-page flex rounded-xl p-[3px]", className)}>
        {visible.map(option => (
          <SegmentButton
            key={option.id}
            label={option.label}
            active={controller.isActionActive(option.id)}
            disabled={controller.isActionDisabled(option.id)}
            onPress={() => runInlineAction(option.id)}
          >
            {option.icon}
          </SegmentButton>
        ))}
      </div>
    );
  };

  if (view === "more") {
    return (
      <div className="px-3.5 pt-3" data-style-panel-view="more">
        <button
          type="button"
          className="text-ink-1 mb-3 flex h-[38px] items-center gap-1 text-[14px] font-semibold"
          {...pressHandlers}
          onClick={() => setView("main")}
        >
          <ChevronLeft size={18} strokeWidth={ICON_STROKE} />
          更多文本样式
        </button>

        <GroupTitle>下划线</GroupTitle>
        <SwatchRow label="颜色">
          {UNDERLINE_COLOR_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              aria-label={`下划线颜色 ${option.label}`}
              aria-pressed={underlinePalette.color === option.value}
              className={cn(
                SWATCH_CLASS,
                underlinePalette.color === option.value && SWATCH_SELECTED_CLASS
              )}
              // 色值来自编辑器下划线数据定义，属文档内容色而非 UI 主题色
              style={{ backgroundColor: option.previewColor }}
              {...pressHandlers}
              onClick={() => applyUnderline({ color: option.value })}
            />
          ))}
        </SwatchRow>
        <div className="bg-page mb-3 flex rounded-xl p-[3px]">
          {UNDERLINE_LINE_TYPE_OPTIONS.map(option => (
            <SegmentButton
              key={option.value}
              label={`下划线线型 ${option.label}`}
              active={underlinePalette.lineType === option.value}
              disabled={false}
              onPress={() => applyUnderline({ lineType: option.value })}
            >
              <span className="text-[13px]">{option.label}</span>
            </SegmentButton>
          ))}
        </div>

        <GroupTitle>渐变文字</GroupTitle>
        <SwatchRow label="渐变" className="mb-3">
          {TEXT_GRADIENT_OPTIONS.map(option => (
            <button
              key={option.preset}
              type="button"
              aria-label={`渐变文字 ${option.label}`}
              aria-pressed={marks?.textGradient === option.preset}
              className={cn(
                SWATCH_CLASS,
                marks?.textGradient === option.preset && SWATCH_SELECTED_CLASS
              )}
              // 渐变取值来自编辑器渐变预设，属文档内容色而非 UI 主题色
              style={{ background: isDark ? option.previewDark : option.previewLight }}
              {...pressHandlers}
              onClick={() => controller.applyGradientMark(option.preset)}
            />
          ))}
        </SwatchRow>

        <GroupTitle>行内元素</GroupTitle>
        <div className="mb-3 flex gap-1.5">
          <TextButton
            label="样式文本"
            active={controller.isActionActive("styled-text")}
            disabled={controller.isActionDisabled("styled-text")}
            onPress={() => controller.executeAction("styled-text")}
          />
          <TextButton
            label="快捷键"
            active={controller.isActionActive("kbd")}
            disabled={controller.isActionDisabled("kbd")}
            onPress={() => controller.executeAction("kbd")}
          />
        </div>
      </div>
    );
  }

  const blockOptions = BLOCK_OPTIONS.filter(option => isVisible(option.itemId));
  const markGroup = renderInlineGroup(INLINE_MARK_OPTIONS, "flex-1");
  const popupGroup = renderInlineGroup(INLINE_POPUP_OPTIONS, "shrink-0");
  const hasColor = Boolean(marks?.color || marks?.darkColor || marks?.textGradient);

  return (
    <div className="px-3.5 pt-3" data-style-panel-view="main">
      {blockOptions.length > 0 ? (
        <>
          <GroupTitle>转换为</GroupTitle>
          <div className="scrollbar-hide mb-3 flex gap-[7px] overflow-x-auto">
            {blockOptions.map(option => {
              const active = currentBlockKind === option.kind;
              return (
                <button
                  key={option.kind}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={active}
                  className={cn(
                    "flex h-[54px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] text-[11px]",
                    active
                      ? "border-accent bg-accent-soft text-accent-text"
                      : "bg-page text-ink-2 border-transparent"
                  )}
                  {...pressHandlers}
                  onClick={() => convertBlock(option.kind)}
                >
                  {option.preview}
                  {option.caption ? <span>{option.caption}</span> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {markGroup || popupGroup ? (
        <>
          <GroupTitle>行内样式</GroupTitle>
          <div className="mb-3 flex gap-1.5">
            {markGroup}
            {popupGroup}
          </div>
        </>
      ) : null}

      {isVisible("text-color") ? (
        <SwatchRow label="文字">
          {TEXT_COLOR_OPTIONS.map(option => {
            const isDefault = !option.lightColor;
            const selected = marks
              ? isDefault
                ? !hasColor
                : marks.color === option.lightColor
              : false;
            const color = isDark ? option.darkColor : option.lightColor;
            return (
              <button
                key={option.label}
                type="button"
                aria-label={`文字颜色 ${option.label}`}
                aria-pressed={selected}
                className={cn(
                  SWATCH_CLASS,
                  "bg-page",
                  isDefault && "text-ink-1",
                  selected && SWATCH_SELECTED_CLASS
                )}
                // 色值来自编辑器文字颜色数据定义，属文档内容色而非 UI 主题色
                style={isDefault ? undefined : { color }}
                {...pressHandlers}
                onClick={() => controller.applyColorMark(option.lightColor, option.darkColor)}
              >
                A
              </button>
            );
          })}
        </SwatchRow>
      ) : null}

      {isVisible("highlight-color") ? (
        <SwatchRow label="高亮">
          {HIGHLIGHT_OPTIONS.map(option => {
            const isDefault = option.value === undefined;
            const selected = marks
              ? isDefault
                ? !marks.highlight
                : marks.highlight === option.value
              : false;
            return (
              <button
                key={option.label}
                type="button"
                aria-label={`高亮颜色 ${option.label}`}
                aria-pressed={selected}
                className={cn(
                  SWATCH_CLASS,
                  isDefault && "bg-page",
                  selected && SWATCH_SELECTED_CLASS
                )}
                // 色值来自编辑器高亮数据定义，属文档内容色而非 UI 主题色
                style={isDefault ? undefined : { backgroundColor: option.previewColor }}
                {...pressHandlers}
                onClick={() => controller.applyHighlightMark(option.value)}
              >
                {isDefault ? (
                  <X size={14} strokeWidth={ICON_STROKE} className="text-ink-3" />
                ) : null}
              </button>
            );
          })}
        </SwatchRow>
      ) : null}

      {isVisible("more-styles") ? (
        <button
          type="button"
          className="bg-page text-ink-1 mb-3 mt-1 flex h-11 w-full items-center justify-between rounded-xl px-3 text-[13.5px]"
          {...pressHandlers}
          onClick={() => setView("more")}
        >
          更多文本样式
          <ChevronRight size={16} strokeWidth={ICON_STROKE} className="text-ink-3" />
        </button>
      ) : null}
    </div>
  );
}

export default StylePanel;
