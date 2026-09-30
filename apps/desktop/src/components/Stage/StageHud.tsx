/**
 * 全屏舞台（演示 / 沉浸写作）底部居中的控制条胶囊。显隐由调用方按鼠标位置决定，
 * 隐藏时下沉淡出且不接收指针。
 */
import type { HTMLAttributes, ReactNode } from "react";
import { IconButton, Tooltip, cn } from "@tau/ui";

interface StageHudProps extends HTMLAttributes<HTMLDivElement> {
  visible: boolean;
}

export function StageHud({ visible, className, children, ...rest }: StageHudProps) {
  return (
    <div
      {...rest}
      className={cn(
        "bg-surface/90 shadow-float ring-line-1 text-tau-sm text-ink-2 ease-tau-out absolute bottom-[26px] left-1/2 z-10 flex h-11 -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 ring-1 backdrop-blur-[10px] transition-[opacity,translate] duration-[260ms]",
        !visible && "pointer-events-none translate-y-2.5 opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StageHudDivider() {
  return <span className="bg-line-1 mx-1 h-[18px] w-px" />;
}

export function StageHudButton({
  label,
  shortcut,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick(): void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip content={shortcut ? `${label} ${shortcut}` : label} placement="top">
      <IconButton
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn("size-8 rounded-full", active && "bg-selected text-accent-text")}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}
