import { Tooltip as BaseTooltip, cn, type TooltipProps } from "@tau/ui";

/**
 * 编辑器内的提示：外观同 @tau/ui，层级抬到悬浮工具条（z 9999）与编辑器浮层（~10100）之上，
 * 否则工具条按钮的提示会被工具条自身盖住。
 */
export function Tooltip({ className, ...props }: TooltipProps) {
  return <BaseTooltip {...props} className={cn("z-[10200]", className)} />;
}

export type { TooltipProps };
