/**
 * 日程周视图重建：结构摘自 features/schedule（ScheduleView / CalendarHeader / WeekView / TimeGridParts / EventChips）。
 * 事件色经 --cal 注入，配色与 eventTone.ts 的 TONE 一致。
 */
import type { CSSProperties } from "react";
import clsx from "clsx";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ListTodo, Plus, SlidersHorizontal, Timer } from "lucide-react";
import { Button, IconButton } from "@tau/ui";
import { PaperPage } from "../parts/PageHeader";
import { SegmentedLook } from "../parts/Segmented";
import { CALENDARS, WEEK_EVENTS } from "../../mock/day";

const HOUR = 40;
const FROM = 8;
const TO = 22;
const TONE =
  "[--cal:var(--cal-l)] dark:[--cal:var(--cal-d)] [--cal-soft:color-mix(in_srgb,var(--cal)_14%,var(--tau-bg-surface))] dark:[--cal-soft:color-mix(in_oklab,var(--cal)_16%,var(--tau-bg-surface-hover))]";

/** pomodoro：系统日历「番茄钟」里的番茄记录，标题前置计时图标（EventTitle.tsx） */
export type WeekEvent = { day: number; start: number; end: number; title: string; cal: number; pomodoro?: boolean };

/** 第几周：label 为标题、firstDate 为周一的日期、today 为今天在周内的序号（-1 表示不在本周） */
export type WeekInfo = { label: string; code: string; firstDate: number; today: number };

const THIS_WEEK: WeekInfo = { label: "10 月 12 – 18 日", code: "2026 · W42", firstDate: 12, today: 5 };

/** events 缺省为「一天」故事线的那一周；added 为新排进来的事件，appear 是它们的出现进度 0→1 */
export function SchedulePage({
  nowHour = 22,
  week = THIS_WEEK,
  events = WEEK_EVENTS,
  added = [],
  appear = [],
  calendars = CALENDARS,
  todayCount = 3,
}: {
  nowHour?: number;
  week?: WeekInfo;
  events?: WeekEvent[];
  added?: WeekEvent[];
  appear?: number[];
  calendars?: { name: string; light: string; dark: string }[];
  todayCount?: number;
}) {
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  const today = week.today;
  return (
    <PaperPage row>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-8 pt-5">
          <div className="mb-2 flex h-10 flex-none items-center gap-2">
            <IconButton>
              <ChevronLeft size={17} strokeWidth={1.75} />
            </IconButton>
            <IconButton>
              <ChevronRight size={17} strokeWidth={1.75} />
            </IconButton>
            <Button variant="secondary" size="sm">
              今天
            </Button>
            <span className="text-tau-title-lg ml-1 flex shrink-0 items-baseline gap-2 rounded-[10px] px-2 py-0.5 font-semibold tracking-[-0.01em] whitespace-nowrap">
              {week.label}
              <span className="text-ink-3 font-tau-mono text-[12px] font-normal">{week.code}</span>
              <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
            </span>
            <span className="flex-1" />
            <SegmentedLook items={["周", "月", "议程"]} active={0} />
            <Button variant="primary" size="sm" icon={Plus}>
              新建日程
            </Button>
            <Button variant="secondary" size="sm" icon={ListTodo}>
              待安排
            </Button>
            <Button variant="secondary" size="sm" icon={CalendarDays}>
              今天 <span className="text-ink-3 font-normal">· {todayCount} 项</span>
            </Button>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-1.5 pb-3">
            {calendars.map(cal => (
              <span
                key={cal.name}
                className={clsx("text-tau-sm border-line-1 bg-surface text-ink-1 inline-flex h-[26px] items-center gap-1.5 rounded-full border pr-2.5 pl-2", TONE)}
                style={{ "--cal-l": cal.light, "--cal-d": cal.dark } as CSSProperties}
              >
                <i className="size-2 rounded-full bg-[var(--cal)]" />
                {cal.name}
              </span>
            ))}
            <IconButton className="size-7">
              <SlidersHorizontal size={14} strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col pr-2 pl-[26px]">
          <div className="flex flex-none pt-1 pr-3 pb-1.5">
            <span className="w-[52px] shrink-0" />
            {days.map((d, i) => (
              <span key={d} className={clsx("mx-0.5 flex flex-1 items-baseline gap-1.5 rounded-[8px] py-0.5 pl-2 text-[12px]", i === today ? "bg-selected text-accent-text" : "text-ink-3")}>
                <span className={clsx("font-tau-mono text-[17px] tabular-nums", i === today ? "text-accent-text font-semibold" : "text-ink-1 font-medium")}>{week.firstDate + i}</span>周{d}
              </span>
            ))}
          </div>
          <div className="relative mt-1 mb-4 flex min-h-0 flex-1 overflow-hidden pt-2 pr-1.5">
            <div className="relative w-[52px] shrink-0">
              {Array.from({ length: TO - FROM }, (_, i) => (
                <span key={i} className="text-ink-3 font-tau-mono absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums" style={{ top: i * HOUR }}>
                  {String(FROM + i).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {days.map((_, day) => (
              <div key={day} className={clsx("relative flex-1", day > 0 && "shadow-[-1px_0_0_var(--tau-line-2)]", day === today && "bg-accent/[0.04]")}>
                {Array.from({ length: TO - FROM }, (_, i) => (
                  <i key={i} className="bg-line-2 absolute inset-x-0 h-px" style={{ top: i * HOUR }} />
                ))}
                {[...events.map(e => ({ e, t: 1 })), ...added.map((e, i) => ({ e, t: appear[i] ?? 0 }))]
                  .filter(({ e, t }) => e.day === day && t > 0)
                  .map(({ e, t }) => {
                    const cal = calendars[e.cal];
                    const past = today >= 0 && (day < today || (day === today && e.end <= nowHour));
                    return (
                      <div
                        key={e.title + e.start}
                        className={clsx(
                          "absolute overflow-hidden rounded-[7px] py-1 pr-1.5 pl-[9px] text-[12px] leading-[1.35] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--cal)]",
                          TONE,
                          past ? "bg-[var(--cal-soft)]" : "bg-surface before:opacity-50"
                        )}
                        style={
                          {
                            "--cal-l": cal.light,
                            "--cal-d": cal.dark,
                            top: (e.start - FROM) * HOUR,
                            height: (e.end - e.start) * HOUR - 2,
                            left: 2,
                            right: 3,
                            outline: past ? undefined : `1px solid color-mix(in srgb, var(--cal) 45%, transparent)`,
                            opacity: Math.min(1, t * 1.6),
                            transform: t < 1 ? `scale(${0.92 + 0.08 * t})` : undefined,
                            boxShadow: t < 1 ? `0 0 0 ${3 * (1 - t)}px color-mix(in srgb, var(--cal) 35%, transparent)` : undefined,
                          } as CSSProperties
                        }
                      >
                        <div className="flex min-w-0 items-center gap-1.5 font-medium">
                          {e.pomodoro && <Timer aria-label="番茄钟" className="size-3 shrink-0 opacity-75" strokeWidth={2} />}
                          <span className="truncate">{e.title}</span>
                        </div>
                        {(e.end - e.start) * HOUR >= 36 && (
                          <div className="text-ink-2 font-tau-mono text-[10.5px] tabular-nums">
                            {fmt(e.start)} – {fmt(e.end)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                {day === today && nowHour < TO && (
                  <div className="bg-accent absolute inset-x-0 z-30 h-[2px]" style={{ top: (nowHour - FROM) * HOUR }}>
                    <i className="bg-accent absolute -top-[3px] -left-1 size-2 rounded-full" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PaperPage>
  );
}

const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
