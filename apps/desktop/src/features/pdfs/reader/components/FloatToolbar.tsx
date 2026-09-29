/**
 * 划线 / 点标注 / 框选后原地弹出的浮动工具条（纯展示，定位由调用方负责）。
 * - selection：5 色（点即按当前样式建标注）+ 高亮 / 下划线切换 + 写笔记 + 问 AI + 复制
 * - annotation：同上，当前色打勾，多一个删除
 * - area-new：存为区域标注 + 问 AI + 复制图片
 * - area：5 色 + 笔记 + 问 AI + 复制图片 + 删除
 * 按下不冒泡且不抢焦点：点工具条不能清掉页面上的选区。
 */

import type { ReactNode } from "react";
import {
  Check,
  Copy,
  Highlighter,
  Image as ImageIcon,
  MessageSquarePlus,
  Sparkles,
  BoxSelect,
  Strikethrough,
  Trash2,
  Underline,
  Waves,
} from "lucide-react";
import { cn } from "@tau/ui";
import type { EHighlightColor } from "@/types";
import { COLOR_SPECS, PICKABLE_COLORS, STYLE_LABEL, type MarkupStyle } from "../annotationModel";

export type FloatToolbarMode = "selection" | "annotation" | "area-new" | "area";

interface FloatToolbarProps {
  mode: FloatToolbarMode;
  /** 当前色：annotation / area 打勾用 */
  color?: EHighlightColor;
  /** annotation = 标注当前样式；selection = 新建时将用的样式 */
  markupStyle?: MarkupStyle;
  hasNote?: boolean;
  canAsk: boolean;
  onColor?: (color: EHighlightColor) => void;
  onToggleStyle?: () => void;
  onNote?: () => void;
  onAsk?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onSaveArea?: () => void;
  className?: string;
}

const STYLE_ICON = {
  highlight: Highlighter,
  underline: Underline,
  squiggly: Waves,
  strikeout: Strikethrough,
} as const;

const ICON = { size: 15, strokeWidth: 1.75 } as const;

function Divider() {
  return <span aria-hidden className="bg-line-1 mx-1 h-4 w-px shrink-0" />;
}

function ToolButton({
  label,
  icon,
  children,
  onClick,
  active,
  danger,
  accent,
}: {
  label: string;
  icon: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={children ? undefined : label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-tau-sm text-tau-sm ease-tau-out flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap transition-[background,color] duration-[160ms]",
        children ? "px-2" : "w-7 justify-center",
        danger
          ? "text-danger hover:bg-danger-soft"
          : accent
            ? "text-accent-text hover:bg-accent-soft"
            : "text-ink-2 hover:bg-hover hover:text-ink-1",
        active && "bg-selected text-accent-text"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function FloatToolbar({
  mode,
  color,
  markupStyle = "highlight",
  hasNote,
  canAsk,
  onColor,
  onToggleStyle,
  onNote,
  onAsk,
  onCopy,
  onDelete,
  onSaveArea,
  className,
}: FloatToolbarProps) {
  const showColors = mode !== "area-new";
  const markChecked = mode === "annotation" || mode === "area";
  const StyleIcon = STYLE_ICON[markupStyle];

  return (
    <div
      role="toolbar"
      aria-label="标注工具条"
      onPointerDown={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={cn(
        "bg-surface shadow-float rounded-tau-md flex h-9 items-center gap-0.5 px-1.5",
        className
      )}
    >
      {showColors &&
        PICKABLE_COLORS.map(c => {
          const on = markChecked && c === color;
          return (
            <button
              key={c}
              type="button"
              title={mode === "selection" ? `高亮 · ${COLOR_SPECS[c].label}` : COLOR_SPECS[c].label}
              aria-label={COLOR_SPECS[c].label}
              aria-pressed={on}
              onClick={() => onColor?.(c)}
              className="rounded-tau-sm hover:bg-hover grid size-7 shrink-0 place-items-center"
            >
              <span
                className={cn(
                  "text-ink-inverse grid size-[18px] place-items-center rounded-full",
                  COLOR_SPECS[c].swatch
                )}
              >
                {on && <Check size={12} strokeWidth={2.5} />}
              </span>
            </button>
          );
        })}

      {(mode === "selection" || mode === "annotation") && (
        <ToolButton
          label={`${STYLE_LABEL[markupStyle]} · 点击切换高亮 / 下划线`}
          icon={<StyleIcon {...ICON} />}
          onClick={onToggleStyle}
          active={markupStyle === "underline"}
        />
      )}

      {mode === "area-new" && (
        <ToolButton label="存为区域标注" icon={<BoxSelect {...ICON} />} onClick={onSaveArea}>
          存为区域标注
        </ToolButton>
      )}

      {showColors && <Divider />}
      {mode !== "area-new" && (
        <ToolButton label="笔记" icon={<MessageSquarePlus {...ICON} />} onClick={onNote}>
          {mode === "selection" || !hasNote ? "写笔记" : "笔记"}
        </ToolButton>
      )}
      {canAsk && (
        <ToolButton label="问 AI" icon={<Sparkles {...ICON} />} onClick={onAsk} accent>
          问 AI
        </ToolButton>
      )}
      {mode === "area-new" || mode === "area" ? (
        <ToolButton label="复制图片" icon={<ImageIcon {...ICON} />} onClick={onCopy}>
          {mode === "area-new" ? "复制图片" : undefined}
        </ToolButton>
      ) : (
        <ToolButton label="复制原文" icon={<Copy {...ICON} />} onClick={onCopy} />
      )}
      {(mode === "annotation" || mode === "area") && (
        <>
          <Divider />
          <ToolButton label="删除标注" icon={<Trash2 {...ICON} />} onClick={onDelete} danger />
        </>
      )}
    </div>
  );
}
