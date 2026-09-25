/**
 * 输入框上沿面板的外观件（D-048 二轮，mockups/chat/composer.html「浮起卡片」）：
 * ＋ 添加面板与 @ 引用面板共用——从输入框上沿向上展开、与输入框同宽，
 * surface + line-1 + shadow-float，分组小标题 + 「图标方块 · 名称 · 淡墨说明」行，
 * 底部一行键位提示（淡纸色托底，不用分隔线）。只管长相，定位 / 键盘由使用方负责。
 */

import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@tau/ui";

/** 输入框外框的锚点标记：面板按它的矩形定位（同宽、贴上沿） */
export const COMPOSER_ANCHOR_ATTR = "data-composer-anchor";

export const ComposerPanel = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function ComposerPanel({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        {...props}
        className={cn(
          "bg-surface border-line-1 shadow-float text-ink-1 flex flex-col overflow-hidden rounded-[16px] border outline-none",
          className
        )}
      >
        {children}
      </div>
    );
  }
);

export function ComposerPanelGroup({ children }: { children: ReactNode }) {
  return (
    <div className="text-tau-sm text-ink-3 px-2.5 pb-1 pt-2 font-semibold first:pt-1.5">
      {children}
    </div>
  );
}

export const ComposerPanelItem = forwardRef<
  HTMLDivElement,
  {
    icon: ReactNode;
    label: ReactNode;
    description?: ReactNode;
    kbd?: string;
    active?: boolean;
    disabled?: boolean;
    onSelect?: () => void;
    onHover?: () => void;
  }
>(function ComposerPanelItem(
  { icon, label, description, kbd, active, disabled, onSelect, onHover },
  ref
) {
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={active}
      aria-disabled={disabled}
      // 不抢编辑器焦点（@ 面板打字时列表跟随）
      onMouseDown={event => event.preventDefault()}
      onMouseEnter={onHover}
      onClick={() => !disabled && onSelect?.()}
      className={cn(
        "text-tau-body flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5",
        active && "bg-hover",
        disabled && "cursor-default opacity-45"
      )}
    >
      <span className="border-line-1 bg-surface text-ink-2 grid size-[26px] shrink-0 place-items-center rounded-[8px] border [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 max-w-[65%] shrink-0 truncate">{label}</span>
      {description && (
        <span className="text-tau-sm text-ink-3 min-w-0 flex-1 truncate">{description}</span>
      )}
      {kbd && <Kbd className="ml-auto">{kbd}</Kbd>}
    </div>
  );
});

export function Kbd({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "border-line-1 bg-surface font-tau-mono text-ink-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[6px] border px-[5px] text-[11px] leading-none",
        className
      )}
    >
      {children}
    </span>
  );
}

/** 页脚键位提示：@ 引用内容 / ↑↓ 选择 / Enter 确认 / Esc 关闭 */
export function ComposerPanelFooter({ hints }: { hints: Array<[string, string]> }) {
  return (
    <div className="text-tau-tiny text-ink-3 flex flex-wrap items-center gap-x-3.5 gap-y-1 bg-[color-mix(in_srgb,var(--tau-bg-page)_45%,var(--tau-bg-surface))] px-3.5 py-2">
      {hints.map(([key, label]) => (
        <span key={key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Kbd>{key}</Kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
