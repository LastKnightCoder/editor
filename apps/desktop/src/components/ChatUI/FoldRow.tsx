/**
 * 折叠行：思考过程与工具调用共用的轻量标题行（D-048）——图标 + 标题 + 淡墨附注 + 箭头，
 * 无底无框，hover 淡墨；展开内容在行下方缩进一级。过程信息视觉上轻，正文才是主角。
 */

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@tau/ui";

export function FoldRow({
  icon,
  title,
  meta,
  expanded,
  onToggle,
  tone = "default",
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn(
        "text-tau-meta ease-tau-out -ml-1.5 flex h-[26px] max-w-full items-center gap-1.5 rounded-[7px] pl-1.5 pr-2 text-left leading-none transition-colors duration-[160ms]",
        "hover:bg-hover",
        tone === "danger" ? "text-danger" : "text-ink-2 hover:text-ink-1",
        className
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 shrink-0 truncate">{title}</span>
      {meta != null && (
        <span className="text-ink-3 min-w-0 truncate">
          <span aria-hidden className="mr-1">
            ·
          </span>
          {meta}
        </span>
      )}
      <ChevronRight
        aria-hidden
        size={13}
        strokeWidth={1.75}
        className={cn(
          "text-ink-3 ease-tau-out shrink-0 transition-transform duration-[160ms]",
          expanded && "rotate-90"
        )}
      />
    </button>
  );
}

/** 折叠行展开区：左缘 2px 引线（控件级细节，非区块分隔）+ 缩进 */
export function FoldBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-line-1 mb-1.5 ml-[5px] mt-1 border-l-2 pl-3.5", className)}>
      {children}
    </div>
  );
}
