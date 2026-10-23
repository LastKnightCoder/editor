import { cn } from "@tau/ui";
import { STATUS_DISPLAY, TONE_CLASS, type PluginLifecycleView } from "./pluginStatus";

export function PluginStatusBadge({ status }: { status: PluginLifecycleView }) {
  const display = STATUS_DISPLAY[status.kind];
  const percent =
    status.kind === "downloading" && status.progress !== null
      ? Math.round(Math.min(Math.max(status.progress, 0), 1) * 100)
      : null;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "inline-flex h-[22px] items-center rounded-full px-2 text-[12px] font-semibold",
          TONE_CLASS[display.tone]
        )}
      >
        {display.label}
        {percent !== null && ` ${percent}%`}
      </span>
      {status.kind === "downloading" && (
        <span
          role="progressbar"
          aria-label="下载进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          className="bg-page relative h-1 w-16 overflow-hidden rounded-full"
        >
          <span
            className={cn(
              "bg-info absolute inset-y-0 left-0 rounded-full",
              percent === null && "w-1/3 animate-pulse"
            )}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </span>
      )}
    </span>
  );
}
