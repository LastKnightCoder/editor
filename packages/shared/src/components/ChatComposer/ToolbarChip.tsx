import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@tau/ui";

/** 输入框工具行的文字按钮（模型 / 思考强度 / 工具权限），作 Menu、Popover 的 trigger */
export function ToolbarChip({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "text-tau-body text-ink-1 ease-tau-out flex h-[30px] min-w-0 max-w-[200px] shrink-0 items-center gap-1 rounded-[9px] pl-2 pr-1.5 transition-colors duration-[160ms]",
        "enabled:hover:bg-hover disabled:cursor-default disabled:opacity-45",
        "aria-expanded:bg-hover [&_svg]:shrink-0",
        className
      )}
    >
      {children}
    </button>
  );
}

export function ChipCaret() {
  return <ChevronDown aria-hidden size={12} strokeWidth={1.75} className="text-ink-3" />;
}
