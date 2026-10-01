/**
 * 脉络浮层的分区与行。其他域往浮层里加分区（如卡片的「连接」）时复用，保持同一视觉。
 */

import type { ReactNode } from "react";
import { cn } from "@tau/ui";

export function ContextSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="[&+&]:mt-2.5">
      <h5 className="text-ink-3 mx-2.5 mb-1 mt-1 text-[12px] font-normal">{title}</h5>
      {children}
    </section>
  );
}

const ROW_BUTTON =
  "block w-full min-w-0 px-2.5 py-[7px] text-left focus-visible:shadow-[var(--tau-focus-ring)] focus-visible:outline-none rounded-tau-sm";

interface ContextRowProps {
  onClick: () => void;
  children: ReactNode;
  /** 行尾操作（如解除），悬停或聚焦行时显现 */
  action?: ReactNode;
}

export function ContextRow({ onClick, children, action }: ContextRowProps) {
  if (!action) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(ROW_BUTTON, "hover:bg-hover transition-colors")}
      >
        {children}
      </button>
    );
  }
  return (
    <div className="hover:bg-hover rounded-tau-sm group/row flex items-center transition-colors">
      <button type="button" onClick={onClick} className={cn(ROW_BUTTON, "flex-1")}>
        {children}
      </button>
      <span className="mr-1.5 shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
        {action}
      </span>
    </div>
  );
}
