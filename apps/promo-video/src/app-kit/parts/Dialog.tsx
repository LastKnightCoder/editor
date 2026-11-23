/**
 * 对话框外壳，结构摘自 packages/ui/src/primitives/Dialog.tsx（遮罩 + 卡片 + 标题行 + 底栏）与 ConfirmDialog.tsx。
 * 真实对话框挂在视口上（fixed），视频里放在窗口内铺满（absolute），appear 0→1 为入场（淡入 + 上移 8px + 0.97→1）。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { Check, X } from "lucide-react";
import { Button, IconButton } from "@tau/ui";

export function DialogFrame({
  title,
  subtitle,
  icon,
  context,
  width,
  height,
  size = "md",
  appear,
  impact,
  footer,
  children,
}: {
  title: string;
  /** 标题下的一行说明 */
  subtitle?: string;
  /** 标题前的图标（lucide 图标，size-4） */
  icon?: ReactNode;
  /** 标题旁的上下文徽标（如视频标题） */
  context?: string;
  width?: number;
  height?: number;
  size?: "sm" | "md" | "lg";
  appear: number;
  impact?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  if (appear <= 0) return null;
  return (
    <div className="bg-overlay absolute inset-0 z-[340] grid place-items-center p-8 backdrop-blur-[4px]" style={{ opacity: appear }}>
      <div
        className={clsx(
          "bg-surface border-line-1 shadow-float rounded-tau-lg text-ink-2 text-tau-body relative flex flex-col border",
          !width && (size === "sm" ? "w-[380px]" : size === "lg" ? "w-[560px]" : "w-[440px]")
        )}
        style={{ width, height: height ? Math.min(height, 900 * 0.82) : undefined, transform: `translateY(${(1 - appear) * 8}px) scale(${0.97 + 0.03 * appear})` }}
      >
        <IconButton className="absolute top-3 right-3 size-[28px] rounded-[8px]">
          <X className="size-[14px]" />
        </IconButton>
        <div className="flex items-center gap-2 pt-[22px] pr-12 pl-6">
          {icon && <span className="text-ink-2 flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">{icon}</span>}
          <h2 className="text-ink-1 min-w-0 truncate text-[16px] leading-[1.45] font-[650] tracking-[-0.01em]">{title}</h2>
          {context && (
            <span className="border-line-1 bg-surface text-ink-2 inline-flex h-[22px] max-w-[176px] shrink-0 items-center gap-[5px] truncate rounded-full border px-2.5 text-[11px]">
              <span className="bg-accent size-[6px] shrink-0 rounded-full" />
              <span className="truncate">{context}</span>
            </span>
          )}
        </div>
        {subtitle && <p className="text-ink-3 text-tau-meta mt-[3px] pr-12 pl-6">{subtitle}</p>}
        {children}
        {(footer || impact) && (
          <div className={clsx("border-line-2 flex items-center gap-2 border-t px-6 py-[14px]", !impact && "justify-end")}>
            {impact && <div className="text-ink-3 min-w-0 flex-1 text-[11.5px] leading-[1.5]">{impact}</div>}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** 按下态：轻微缩小 + 压暗，包在按钮外面 */
export function Pressed({ on, children }: { on: boolean; children: ReactNode }) {
  return <span style={{ display: "inline-flex", transform: on ? "scale(0.96)" : undefined, filter: on ? "brightness(0.92)" : undefined }}>{children}</span>;
}

/** 确认框：正文 + 取消 / 主按钮（ConfirmDialog）；checkbox 是正文下面的勾选行 */
export function ConfirmCard({
  title,
  description,
  confirmText,
  appear,
  pressed,
  checkbox,
}: {
  title: string;
  description: string;
  confirmText: string;
  appear: number;
  pressed?: boolean;
  checkbox?: { label: string; checked: boolean };
}) {
  return (
    <DialogFrame
      title={title}
      appear={appear}
      footer={
        <>
          <Button variant="secondary">取消</Button>
          <span data-hit="confirm">
            <Pressed on={!!pressed}>
              <Button variant="primary">{confirmText}</Button>
            </Pressed>
          </span>
        </>
      }
    >
      <div className="min-h-0 pt-[8px] pr-[18px] pb-[22px] pl-6">
        <p>{description}</p>
        {checkbox && (
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 select-none">
            <span className="relative inline-grid size-6 shrink-0 place-items-center">
              <span className={clsx("bg-surface border-line-1 grid size-4 place-items-center rounded-[4.5px] border-[1.5px]", checkbox.checked && "border-accent bg-accent")}>
                {checkbox.checked && <Check strokeWidth={2.5} className="text-ink-inverse size-3" />}
              </span>
            </span>
            <span className="text-ink-1 text-tau-body whitespace-normal">{checkbox.label}</span>
          </label>
        )}
      </div>
    </DialogFrame>
  );
}
