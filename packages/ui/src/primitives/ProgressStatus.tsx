import { cn } from "../cn";
import { ProgressBar } from "./ValueDisplay";

export function ProgressStatus({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const percent = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("space-y-2 text-left", className)}>
      <div className="text-tau-sm text-ink-2 flex items-start justify-between gap-3">
        <span role="status">{label}</span>
        <span className="shrink-0 tabular-nums">{Math.floor(percent)}%</span>
      </div>
      <ProgressBar value={percent} label={label} />
    </div>
  );
}
