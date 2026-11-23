/**
 * 菜单的静态外观，类名摘自 packages/ui/src/primitives/Menu.tsx。视频里不需要交互：展开、高亮、按下都由调用方给。
 */
import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";

export function MenuSurface({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={clsx(
        "bg-surface border-line-1 shadow-float rounded-tau-lg absolute z-[250] flex w-max min-w-[160px] max-w-[min(320px,calc(100vw-16px))] flex-col overflow-hidden border p-[6px]",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

export function MenuItem({ children, icon, chevron, highlighted, danger, hit }: { children: ReactNode; icon?: ReactNode; chevron?: boolean; highlighted?: boolean; danger?: boolean; hit?: string }) {
  return (
    <div
      data-hit={hit}
      className={clsx(
        "text-ink-1 rounded-tau-sm text-tau-body mb-[2px] flex h-[34px] cursor-pointer items-center gap-[9px] px-2.5 text-left",
        highlighted && "bg-hover",
        danger && "text-danger data-[danger=true]:text-danger"
      )}
      data-danger={danger ? "true" : undefined}
    >
      {icon && <span className="text-ink-2 [&>svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {chevron && <ChevronRight className="text-ink-3 ml-auto h-3 w-3 shrink-0" strokeWidth={2} />}
    </div>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="bg-line-1 mx-1 my-1.5 h-px" />;
}
