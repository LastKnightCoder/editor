/** 预设色点与「提前结束」标签。 */

import { cn } from "@tau/ui";
import { presetDotClass } from "./presetTone";

export function PresetDot({
  presetId,
  exists = true,
  className,
}: {
  presetId: number;
  exists?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", presetDotClass(presetId, exists), className)}
    />
  );
}

export function EarlyTag() {
  return (
    <span className="bg-warn-soft text-warn text-tau-micro inline-flex h-5 shrink-0 items-center rounded-[6px] px-1.5">
      提前结束
    </span>
  );
}
