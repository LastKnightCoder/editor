import React from "react";
import { cn } from "@tau/ui";
import { Tooltip } from "../../ui/Tooltip";

/**
 * 悬浮工具条子面板（颜色 / 下划线等）的共享形制：surface 卡片 + 分组小标题 + 30px 色块格。
 * 色块画成品样子（彩色字、高亮字、线段），当前值用 accent 描边标出；分组只靠留白。
 */

export const inlineStylePanelClass =
  "flex w-max flex-col gap-3 rounded-[14px] border border-solid border-[var(--ed-border)] bg-[var(--ed-bg-surface)] p-2.5 text-[var(--ed-text)] shadow-[var(--ed-shadow-float)] animate-[ed-menu-fade-in_120ms_ease-out]";

interface PanelGroupProps {
  label: string;
  /** 小标题右侧的当前取值（如「红色」） */
  value?: string;
  children: React.ReactNode;
}

export const PanelGroup = ({ label, value, children }: PanelGroupProps) => (
  <div>
    <div className="flex items-center justify-between px-1 pb-1.5 text-[12px] font-medium text-[var(--ed-text-tertiary)]">
      <span>{label}</span>
      {value && <span className="font-normal text-[var(--ed-text-secondary)]">{value}</span>}
    </div>
    <div className="flex gap-1">{children}</div>
  </div>
);

interface SwatchProps {
  label: string;
  active?: boolean;
  onPick: () => void;
  className?: string;
  children: React.ReactNode;
}

/** 色块 / 选项格：mousedown 不抢焦点，保住编辑器选区 */
export const Swatch = ({ label, active, onPick, className, children }: SwatchProps) => (
  <Tooltip content={label} placement="bottom">
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={event => event.preventDefault()}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onPick();
      }}
      className={cn(
        "flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[8px] border-none bg-transparent p-0 text-[var(--ed-text)] transition-colors duration-150 hover:bg-[var(--ed-bg-hover)]",
        active &&
          "bg-[var(--ed-accent-soft)] shadow-[inset_0_0_0_1.5px_var(--ed-accent)] hover:bg-[var(--ed-accent-soft)]",
        className
      )}
    >
      {children}
    </button>
  </Tooltip>
);

/** 色块里的示例字形「A」 */
export const SwatchGlyph = ({ style }: { style?: React.CSSProperties }) => (
  <span className="text-[15px] font-[650] leading-none" style={style}>
    A
  </span>
);

interface PanelActionProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}

/** 面板底部的整行动作（如「清除颜色」） */
export const PanelAction = ({ icon, children, onClick }: PanelActionProps) => (
  <button
    type="button"
    onMouseDown={event => event.preventDefault()}
    onClick={event => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    }}
    className="-mx-1 -mb-1 flex cursor-pointer items-center gap-2 rounded-[8px] border-none bg-transparent px-2 py-1.5 text-[12.5px] text-[var(--ed-text-secondary)] transition-colors duration-150 hover:bg-[var(--ed-bg-hover)] hover:text-[var(--ed-text)] [&_svg]:size-3.5"
  >
    {icon}
    {children}
  </button>
);
