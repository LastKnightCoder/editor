import React, { memo } from "react";
import { cn } from "@tau/ui";
import { CellValue, ColumnDef } from "../../../types";
import {
  describeDate,
  isEmptyDateValue,
  RangeDateDisplay,
  SingleDateDisplay,
} from "../utils/dateUtils";
import { useMinuteClock } from "../hooks/useMinuteClock";
import { DatePluginConfig, DateValue } from "../index";

interface DateRendererProps {
  value: CellValue;
  column: ColumnDef;
}

// 看板卡片会把 .whitespace-nowrap / .flex-nowrap 改成可换行，这里用 text-nowrap 保持单行
const CELL_CLASS =
  "@container box-border flex h-full w-full min-w-0 items-center overflow-hidden px-2 py-2 text-tau-body tabular-nums text-nowrap";

// 窄列退化：先隐藏相对提示，再隐藏时间，主文案最后截断
const HINT_CLASS = "text-tau-sm shrink-0 @max-[190px]:hidden";
const TIME_CLASS = "@max-[130px]:hidden";

const SingleDate: React.FC<{ display: SingleDateDisplay }> = ({ display }) => (
  <div className="flex min-w-0 items-center gap-1.5">
    <span
      className={cn(
        "truncate",
        display.tone === "today" && "text-accent-text font-medium",
        display.tone === "past" && "text-ink-3"
      )}
    >
      {display.label}
    </span>
    {display.time && (
      <span
        className={cn(
          "shrink-0",
          display.tone === "past" ? "text-ink-3" : "text-ink-2",
          TIME_CLASS
        )}
      >
        {display.time}
      </span>
    )}
    {display.hint && <span className={cn(HINT_CLASS, "text-ink-3")}>{display.hint}</span>}
  </div>
);

const RANGE_TRACK_CLASS: Record<RangeDateDisplay["status"], string> = {
  live: "ring-1 ring-inset ring-line-1",
  open: "ring-1 ring-inset ring-line-1",
  done: "ring-1 ring-inset ring-line-1 text-ink-3",
  upcoming:
    "border border-dashed border-line-1 bg-[repeating-linear-gradient(-45deg,transparent_0_5px,var(--tau-line-2)_5px_6px)]",
};

/** 范围轨道：已过去部分填充，填充右缘即「今天」 */
const RangeDate: React.FC<{ display: RangeDateDisplay }> = ({ display }) => {
  const { status } = display;
  const end = display.end ?? (status === "open" ? "至今" : null);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div
        className={cn(
          "rounded-tau-sm relative inline-flex h-6 min-w-0 items-center overflow-hidden px-2",
          RANGE_TRACK_CLASS[status]
        )}
      >
        {status === "live" && (
          <span
            className="bg-accent-soft absolute inset-y-0 left-0"
            style={{ width: `${display.progress * 100}%` }}
          >
            <span className="bg-accent absolute inset-y-1 right-0 w-0.5 rounded-full" />
          </span>
        )}
        {status === "done" && <span className="bg-hover absolute inset-0" />}
        {status === "open" && (
          <span className="from-accent-soft bg-linear-to-r absolute inset-0 from-60% to-transparent" />
        )}
        <span className="relative flex min-w-0 items-center gap-1.5">
          <span className="truncate">
            {display.start}
            {display.startTime && (
              <span className={cn("ml-1", TIME_CLASS)}>{display.startTime}</span>
            )}
          </span>
          {end ? (
            <>
              <span className="text-tau-micro text-ink-3 shrink-0">→</span>
              <span className="truncate">
                {end}
                {display.endTime && (
                  <span className={cn("ml-1", TIME_CLASS)}>{display.endTime}</span>
                )}
              </span>
            </>
          ) : (
            display.startTime && (
              <span className={cn("shrink-0", TIME_CLASS)}>– {display.endTime}</span>
            )
          )}
        </span>
      </div>
      <span
        className={cn(
          HINT_CLASS,
          status === "live" || status === "open" ? "text-accent-text" : "text-ink-3"
        )}
      >
        {display.hint}
      </span>
    </div>
  );
};

const DateView: React.FC<{ value: DateValue; config: DatePluginConfig | undefined }> = ({
  value,
  config,
}) => {
  const now = useMinuteClock();
  const display = describeDate(value, config ?? {}, now);
  if (!display) return <div className={CELL_CLASS} />;
  return (
    <div className={CELL_CLASS} title={display.title}>
      {display.kind === "single" ? (
        <SingleDate display={display} />
      ) : (
        <RangeDate display={display} />
      )}
    </div>
  );
};

const DateRenderer: React.FC<DateRendererProps> = memo(({ value, column }) => {
  const dateValue = value as DateValue | null;
  // 空单元格不订阅分钟时钟
  if (isEmptyDateValue(dateValue)) return <div className={CELL_CLASS} />;
  return (
    <DateView
      value={dateValue as DateValue}
      config={column.config as DatePluginConfig | undefined}
    />
  );
});

export default DateRenderer;
