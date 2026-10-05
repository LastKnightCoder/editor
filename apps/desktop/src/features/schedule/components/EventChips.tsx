/**
 * 日程的三种展示形态（日/周/月视图共用，取代各视图里复制的内联色块）：
 * - AllDayBar：全天 / 跨天 / 标记（截止、周期打卡）= 数据色软底条，文字取数据色偏墨，跨行续接处去圆角；
 *   定时标记带时刻，已完成的标记整体变淡；
 * - TimedChip：月视图单日定时 = 透明底 + 色点 + mono 时间；
 * - TimedBlock：时间网格块 = 左缘 3px 色条 + 账本底色（记录实心、计划空心描边、进行中在现在处切开）。
 * 位置由调用方（布局算法）通过 style 给出，这里只管皮。
 */

import type { CSSProperties, MouseEvent } from "react";
import { cn } from "@tau/ui";
import { formatTime } from "@/utils/calendar";
import type { Calendar, CalendarEvent } from "@/types";
import { PLAN_OUTLINE, TONE, TONE_SOFT_BG, eventToneStyle, ledgerFill } from "../eventTone";
import type { LedgerPhase } from "../ledger";
import { EventTitle, type EventDecor } from "./EventTitle";

interface ChipProps {
  event: CalendarEvent;
  calendars: Calendar[];
  decor: EventDecor;
  /** 参数为被点元素（速览浮层的锚点） */
  onClick: (anchor: HTMLElement) => void;
  style?: CSSProperties;
  className?: string;
}

const stop = (e: MouseEvent) => e.stopPropagation();

const TONE_TEXT = "text-[color-mix(in_srgb,var(--cal)_78%,var(--tau-ink-1))]";

export function AllDayBar({
  event,
  calendars,
  decor,
  onClick,
  style,
  className,
  continuesLeft,
  continuesRight,
}: ChipProps & { continuesLeft?: boolean; continuesRight?: boolean }) {
  const markerTime = event.allDay ? null : event.startTime;
  return (
    <div
      title={event.title}
      onClick={e => {
        e.stopPropagation();
        onClick(e.currentTarget);
      }}
      onMouseDown={stop}
      style={{ ...eventToneStyle(event, calendars), ...style }}
      className={cn(
        "flex h-5 cursor-pointer items-center rounded-[6px] px-[7px] text-[11.5px] font-medium",
        "transition-[filter] duration-[160ms] hover:brightness-[0.97]",
        TONE,
        TONE_SOFT_BG,
        TONE_TEXT,
        continuesLeft && "rounded-l-none",
        continuesRight && "rounded-r-none",
        decor.source?.isCompleted && "opacity-55",
        className
      )}
    >
      {markerTime !== null && (
        <span className="font-tau-mono mr-1.5 shrink-0 text-[10.5px] tabular-nums opacity-80">
          {formatTime(markerTime)}
        </span>
      )}
      <EventTitle event={event} decor={decor} />
    </div>
  );
}

export function TimedChip({ event, calendars, decor, onClick, style, className }: ChipProps) {
  return (
    <div
      title={event.title}
      onClick={e => {
        e.stopPropagation();
        onClick(e.currentTarget);
      }}
      onMouseDown={stop}
      style={{ ...eventToneStyle(event, calendars), ...style }}
      className={cn(
        "hover:bg-hover @container flex h-5 cursor-pointer items-center gap-1.5 rounded-[6px] px-1.5 text-[12px]",
        TONE,
        className
      )}
    >
      <i className="size-1.5 shrink-0 rounded-full bg-[var(--cal)]" />
      {event.startTime !== null && (
        // 窄格优先保标题：宽度不足 112px 时隐去时间
        <span className="text-ink-3 font-tau-mono @[112px]:inline hidden shrink-0 text-[11px] tabular-nums">
          {formatTime(event.startTime)}
        </span>
      )}
      <EventTitle event={event} decor={decor} />
    </div>
  );
}

export function TimedBlock({
  event,
  calendars,
  decor,
  onClick,
  style,
  className,
  compact,
  phase,
}: ChipProps & { compact?: boolean; phase: LedgerPhase }) {
  const fill = ledgerFill(phase);
  const planned = phase.kind !== "record";
  const range =
    event.startTime !== null
      ? `${formatTime(event.startTime)}${event.endTime !== null ? ` – ${formatTime(event.endTime)}` : ""}`
      : "";
  return (
    <div
      title={event.title}
      onClick={e => {
        e.stopPropagation();
        onClick(e.currentTarget);
      }}
      onMouseDown={stop}
      style={{
        ...eventToneStyle(event, calendars),
        ...fill.style,
        // 计划 / 进行中的描边：用 outline 而非 box-shadow，不与悬停阴影互相覆盖
        ...(planned && { outline: `1px solid ${PLAN_OUTLINE}`, outlineOffset: -1 }),
        ...style,
      }}
      className={cn(
        "absolute cursor-pointer overflow-hidden rounded-[7px] py-1 pl-[9px] pr-1.5",
        "hover:shadow-lift text-[12px] leading-[1.35] transition-shadow duration-[160ms]",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--cal)]",
        TONE,
        fill.className,
        phase.kind === "plan" && "before:opacity-50",
        className
      )}
    >
      {compact ? (
        <div className="flex min-w-0 items-baseline gap-1.5">
          <EventTitle event={event} decor={decor} className="font-medium" />
          <span className="text-ink-2 font-tau-mono shrink-0 text-[10.5px]">
            {range.split(" – ")[0]}
          </span>
        </div>
      ) : (
        <>
          <EventTitle event={event} decor={decor} className="font-medium" />
          <div className="text-ink-2 font-tau-mono text-[10.5px] tabular-nums">{range}</div>
        </>
      )}
    </div>
  );
}
