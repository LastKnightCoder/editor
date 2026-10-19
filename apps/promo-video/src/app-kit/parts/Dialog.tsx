/**
 * 对话框外壳，结构摘自 packages/ui/src/primitives/Dialog.tsx（遮罩 + 卡片 + 标题行 + 底栏）与 ConfirmDialog.tsx。
 * 真实对话框挂在视口上（fixed），视频里放在窗口内铺满（absolute），appear 0→1 为入场（淡入 + 上移 8px + 0.97→1）。
 */
import type { ReactNode } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { Button, IconButton } from "@tau/ui";

export function DialogFrame({
  title,
  width,
  height,
  size = "md",
  appear,
  impact,
  footer,
  children,
}: {
  title: string;
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
          <h2 className="text-ink-1 min-w-0 truncate text-[16px] leading-[1.45] font-[650] tracking-[-0.01em]">{title}</h2>
        </div>
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

/** 确认框：正文 + 取消 / 主按钮（ConfirmDialog） */
export function ConfirmCard({ title, description, confirmText, appear, pressed }: { title: string; description: string; confirmText: string; appear: number; pressed?: boolean }) {
  return (
    <DialogFrame
      title={title}
      appear={appear}
      footer={
        <>
          <Button variant="secondary">取消</Button>
          <Pressed on={!!pressed}>
            <Button variant="primary">{confirmText}</Button>
          </Pressed>
        </>
      }
    >
      <div className="min-h-0 pt-[8px] pr-[18px] pb-[22px] pl-6">{description}</div>
    </DialogFrame>
  );
}
