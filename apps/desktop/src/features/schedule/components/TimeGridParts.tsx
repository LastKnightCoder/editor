/**
 * 日 / 周时间网格的共用零件：时刻刻度、小时线、当前时间线、拖拽选区与待创建占位。
 * 布局与拖拽逻辑仍在各视图（useTimeSlotDrag / useEventOverlap 原样复用）。
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@tau/ui";
import { formatTime } from "@/utils/calendar";

/** 15 分钟一格的高度（小时 = 48px） */
export const CELL_HEIGHT = 12;
export const HOUR_HEIGHT = CELL_HEIGHT * 4;
export const GRID_HEIGHT = HOUR_HEIGHT * 24;
export const GUTTER = "w-[52px] shrink-0";

const HOURS = Array.from({ length: 23 }, (_, i) => (i + 1) * 60);

export const minutesToPx = (minutes: number) => (minutes / 15) * CELL_HEIGHT;

export function useNowMinutes() {
  const [now, setNow] = useState(currentMinutes);
  useEffect(() => {
    const timer = setInterval(() => setNow(currentMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function currentMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** 日期变化时把当前时间滚到视口上三分之一处 */
export function useScrollToNow(dep: unknown): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = Math.max(0, minutesToPx(currentMinutes()) - el.clientHeight / 3);
  }, [dep]);
  return ref;
}

export function HourGutter() {
  return (
    <div className={cn("relative", GUTTER)} style={{ height: GRID_HEIGHT }}>
      {HOURS.map(m => (
        <span
          key={m}
          className="text-ink-3 font-tau-mono absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums"
          style={{ top: minutesToPx(m) }}
        >
          {formatTime(m)}
        </span>
      ))}
    </div>
  );
}

export function HourLines() {
  return (
    <>
      {HOURS.map(m => (
        <div
          key={m}
          className="bg-line-2 pointer-events-none absolute inset-x-0 h-px"
          style={{ top: minutesToPx(m) }}
        />
      ))}
    </>
  );
}

export function NowLine({ minutes, withDot = true }: { minutes: number; withDot?: boolean }) {
  return (
    <div
      className="bg-accent pointer-events-none absolute inset-x-0 z-30 h-[2px]"
      style={{ top: minutesToPx(minutes) - 1 }}
    >
      {withDot && <span className="bg-accent absolute -left-1 -top-[3px] size-2 rounded-full" />}
    </div>
  );
}

export function DragRange({ start, end }: { start: number; end: number }) {
  return (
    <div
      className="bg-accent-soft pointer-events-none absolute inset-x-0.5 z-20 rounded-[7px]"
      style={{ top: minutesToPx(start), height: minutesToPx(end - start) }}
    />
  );
}

export function PendingRange({ start, end }: { start: number; end: number }) {
  return (
    <div
      className="border-accent bg-accent-soft pointer-events-none absolute inset-x-0.5 z-20 rounded-[7px] border-[1.5px] border-dashed px-2 py-1"
      style={{ top: minutesToPx(start), height: Math.max(minutesToPx(end - start) - 2, 18) }}
    >
      <span className="text-accent-text font-tau-mono text-[10.5px] font-semibold">
        {formatTime(start)} – {formatTime(end)}
      </span>
    </div>
  );
}
