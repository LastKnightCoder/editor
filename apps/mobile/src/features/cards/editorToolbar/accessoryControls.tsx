import type { ReactNode, SyntheticEvent } from "react";

// 配件栏通用控件：通用 / 上下文模式与媒体模式共用

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/** 按下时阻止按钮抢走编辑器焦点（键盘不因触按而收起） */
export function keepEditorFocus(event: SyntheticEvent) {
  event.preventDefault();
}

export type AccessoryButtonProps = {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  /** 宽度与文字排版，默认 w-10 方形按钮 */
  className?: string;
  children: ReactNode;
};

type ContextChipProps = {
  icon?: ReactNode;
  label: string;
  /** 标签右侧附加图标（如代码块语言的下拉箭头） */
  trailing?: ReactNode;
  ariaLabel?: string;
  /** 不传时渲染为不可点的静态标签 */
  onPress?: () => void;
};

const CONTEXT_CHIP_CLASS =
  "bg-accent-soft text-accent-text mx-1 flex h-7 max-w-[120px] shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] font-semibold";

/** 上下文模式左端标签：标明当前模式，点击由调用方决定行为（退回通用模式或打开选择） */
export function ContextChip(props: ContextChipProps) {
  const { icon, label, trailing, ariaLabel, onPress } = props;
  const content = (
    <>
      {icon}
      <span className="truncate">{label}</span>
      {trailing}
    </>
  );
  if (!onPress) {
    return (
      <span
        data-context-chip="static"
        aria-label={ariaLabel}
        className={cn(CONTEXT_CHIP_CLASS, "select-none")}
        onPointerDown={keepEditorFocus}
        onMouseDown={keepEditorFocus}
      >
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={CONTEXT_CHIP_CLASS}
      onPointerDown={keepEditorFocus}
      onMouseDown={keepEditorFocus}
      onClick={onPress}
    >
      {content}
    </button>
  );
}

export function AccessoryButton(props: AccessoryButtonProps) {
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
