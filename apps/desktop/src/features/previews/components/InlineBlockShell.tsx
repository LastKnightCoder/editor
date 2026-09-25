/**
 * 对话内直出块的外壳（D-057：Mermaid / 白板）：line-1 描边圆角框，右上角悬停淡入
 * 「放大」（进统一预览框）与「复制源码」，占固定槽位不顶开布局。
 */

import type { ReactNode } from "react";
import { Copy, Maximize2 } from "lucide-react";
import { IconButton, cn, toast } from "@tau/ui";

export function InlineBlockShell({
  source,
  onExpand,
  className,
  children,
}: {
  source: string;
  onExpand?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const copy = () =>
    void navigator.clipboard.writeText(source).then(
      () => toast.success("源码已复制"),
      () => toast.error("复制失败")
    );
  return (
    <div
      className={cn(
        "border-line-1 bg-surface rounded-tau-md group/inline relative my-3 min-w-0 overflow-hidden border first:mt-0 last:mb-0",
        className
      )}
    >
      {children}
      <div className="bg-surface/90 ease-tau-out absolute right-1.5 top-1.5 flex gap-0.5 rounded-[9px] p-0.5 opacity-0 transition-opacity duration-[160ms] focus-within:opacity-100 group-hover/inline:opacity-100">
        <IconButton aria-label="复制源码" title="复制源码" className="size-7" onClick={copy}>
          <Copy size={14} strokeWidth={1.75} />
        </IconButton>
        {onExpand && (
          <IconButton aria-label="放大" title="放大" className="size-7" onClick={onExpand}>
            <Maximize2 size={14} strokeWidth={1.75} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
