/**
 * 侧栏「番茄专注」入口的实时计时：专注中显示剩余 / 已专注时间与呼吸点，暂停显示「已暂停」；
 * 侧栏收起为图标列时退化为图标右上角的状态点。计时在主进程，离开番茄页也看得到。
 */

import { cn } from "@tau/ui";
import { formatClock } from "../model";
import { useLiveTiming } from "../timerStore";

export function PomodoroNavBadge({ collapsed }: { collapsed: boolean }) {
  const { timing } = useLiveTiming();
  if (!timing) return null;
  const dot = (
    <i
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        timing.paused ? "bg-warn" : "bg-accent animate-pulse"
      )}
    />
  );
  if (collapsed) return <span className="absolute right-2.5 top-2">{dot}</span>;
  return (
    <span
      className={cn(
        "ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium tabular-nums",
        timing.paused ? "text-warn" : "text-accent-text"
      )}
    >
      {dot}
      {timing.paused ? "已暂停" : formatClock(timing.displayMs)}
    </span>
  );
}
