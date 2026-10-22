/**
 * 侧栏条目下方的子项行（问题分组、插件子项共用）：让出父项图标列，高亮只盖色点起的一段；
 * 拖放悬停时描 accent 边。
 */

import type { DragEvent, ReactNode } from "react";
import { cn } from "@tau/ui";

export interface NavChildProps {
  active: boolean;
  dropping?: boolean;
  label: string;
  count?: number;
  glyph: ReactNode;
  title?: string;
  className?: string;
  onClick: () => void;
  onDragOver?(e: DragEvent): void;
  onDragLeave?(): void;
  onDrop?(e: DragEvent): void;
}

export function NavChild({
  active,
  dropping = false,
  label,
  count = 0,
  glyph,
  title,
  className,
  onClick,
  ...drop
}: NavChildProps) {
  return (
    // 让出父项图标列（按 body 字号折算）放在按钮外：高亮只盖色点起的一段，色点落在父项文字列
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        {...drop}
        aria-current={active ? "page" : undefined}
        title={title}
        className={cn(
          "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-left transition-[background,color,box-shadow] duration-[160ms]",
          active
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1",
          dropping && "shadow-[inset_0_0_0_1px_var(--tau-accent)]",
          className
        )}
      >
        <span className="grid w-[13px] shrink-0 place-items-center">{glyph}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && (
          <span className="text-tau-tiny text-ink-3 font-normal tabular-nums">{count}</span>
        )}
      </button>
    </div>
  );
}
