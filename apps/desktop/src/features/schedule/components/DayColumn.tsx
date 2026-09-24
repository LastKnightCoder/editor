/**
 * 右栏 · 当日时间线（方案 C）：选中日 = store.currentDate（月视图点格子 / 周视图点日期头切换）。
 *
 * 大号日期 → 全天条 → 定时日程时间线（08:00–22:00 内 ≥1 小时的空档显示「点击安排」，
 * 今天插入「现在」）→ 底部自然语言快速添加（quickAdd.ts 解析，回车直接创建）。
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CornerDownLeft, Plus } from "lucide-react";
import { IconButton, cn, toast, useEdgeFade } from "@tau/ui";
import useCalendarStore from "@/stores/useCalendarStore";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { formatTime, getDateStart } from "@/utils/calendar";
import type { CalendarEvent } from "@/types";
import { TONE, TONE_SOFT_BG, eventToneStyle } from "../eventTone";
import { usePeekStore } from "../peekStore";
import { parseQuickAdd } from "../quickAdd";
import { AllDayBar } from "./EventChips";
import { EventTitle, useEventDecor } from "./EventTitle";
import { useNowMinutes } from "./TimeGridParts";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const DAY_FROM = 8 * 60;
const DAY_TO = 22 * 60;
const MIN_GAP = 60;

type TimelineItem =
  | { kind: "event"; event: CalendarEvent; start: number; end: number }
  | { kind: "gap"; start: number; end: number }
  | { kind: "now"; at: number };

const hours = (minutes: number) => `${Number((minutes / 60).toFixed(1))} 小时`;

export function DayColumn() {
  const currentDate = useCalendarStore(s => s.currentDate);
  const calendars = useCalendarStore(s => s.calendars);
  const { setCurrentDate, setEditingEvent } = useCalendarStore.getState();
  const peek = usePeekStore(s => s.peek);
  const { events } = useCalendarEvents();
  const nowMinutes = useNowMinutes();
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  const day = getDateStart(currentDate);
  const date = new Date(day);
  const isToday = day === getDateStart(Date.now());

  const dayEvents = useMemo(
    () =>
      (events ?? []).filter(event => {
        const start = getDateStart(event.startDate);
        const end = event.endDate ? getDateStart(event.endDate) : start;
        return day >= start && day <= end;
      }),
    [events, day]
  );
  const decorOf = useEventDecor(dayEvents);
  const allDay = dayEvents.filter(e => e.allDay);

  const items = useMemo(() => {
    const timed = dayEvents
      .filter(e => !e.allDay && e.startTime !== null)
      .map(e => ({ event: e, start: e.startTime!, end: e.endTime ?? e.startTime! + 60 }))
      .sort((a, b) => a.start - b.start);
    const list: TimelineItem[] = [];
    let nowPlaced = !isToday;
    // 今天已过去的时段不再提示安排：空档从当前时间（向上取整到 15 分）起算
    const nowSlot = Math.ceil(nowMinutes / 15) * 15;
    const pushGap = (from: number, to: number) => {
      const start = Math.max(from, DAY_FROM, isToday ? nowSlot : 0);
      const end = Math.min(to, DAY_TO);
      if (end - start >= MIN_GAP) list.push({ kind: "gap", start, end });
    };
    const pushNowBefore = (at: number) => {
      if (!nowPlaced && nowMinutes < at) {
        list.push({ kind: "now", at: nowMinutes });
        nowPlaced = true;
      }
    };
    let cursor = 0;
    for (const item of timed) {
      pushNowBefore(Math.max(item.start, cursor));
      pushGap(cursor, item.start);
      list.push({ kind: "event", ...item });
      cursor = Math.max(cursor, item.end);
    }
    pushNowBefore(24 * 60);
    pushGap(cursor, DAY_TO);
    return list;
  }, [dayEvents, isToday, nowMinutes]);

  const busy = items.reduce(
    (sum, item) => (item.kind === "event" ? sum + item.end - item.start : sum),
    0
  );
  const total = dayEvents.length;

  const defaultCalendar = calendars.find(c => !c.isInSystemGroup && !c.archived);

  const scheduleGap = (start: number) => {
    if (!defaultCalendar) {
      toast.warning("请先创建一个日历");
      return;
    }
    setEditingEvent({
      id: 0,
      createTime: Date.now(),
      updateTime: Date.now(),
      calendarId: defaultCalendar.id,
      title: "",
      detailContentId: 0,
      startDate: day,
      endDate: day,
      startTime: start,
      endTime: Math.min(start + 60, 24 * 60 - 1),
      color: null,
      allDay: false,
    });
  };

  return (
    <div className="bg-surface shadow-card rounded-tau-lg flex w-[340px] flex-none flex-col overflow-hidden">
      <div className="flex items-end gap-3 px-5 pb-2 pt-[18px]">
        <span
          className={cn(
            "font-tau-mono text-[44px] font-medium tabular-nums leading-[0.95] tracking-[-0.02em]",
            isToday && "text-accent-text"
          )}
        >
          {date.getDate()}
        </span>
        <div className="flex flex-col pb-0.5">
          <b className="text-tau-title font-semibold">
            周{WEEKDAYS[date.getDay()]}
            {isToday && " · 今天"}
          </b>
          <span className="text-ink-2 text-tau-meta">
            {date.getFullYear()} 年 {date.getMonth() + 1} 月
          </span>
        </div>
        <span className="flex-1" />
        <IconButton
          className="size-7"
          title="前一天"
          aria-label="前一天"
          onClick={() => setCurrentDate(day - 12 * 3600000)}
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} />
        </IconButton>
        <IconButton
          className="size-7"
          title="后一天"
          aria-label="后一天"
          onClick={() => setCurrentDate(day + 36 * 3600000)}
        >
          <ChevronRight className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
      <p className="text-ink-3 text-tau-sm px-5 pb-2.5">
        {total === 0 ? "这一天还没有安排" : `${total} 项${busy ? ` · 已排 ${hours(busy)}` : ""}`}
      </p>

      <div
        ref={setScrollEl}
        className="edge-fade-scroll min-h-0 flex-1 overflow-y-auto pb-3 pl-5 pr-4"
      >
        {allDay.length > 0 && (
          <div className="flex flex-col gap-1 pb-2.5 pl-[70px]">
            {allDay.map(event => (
              <AllDayBar
                key={event.id}
                event={event}
                calendars={calendars}
                decor={decorOf(event)}
                onClick={anchor => peek(event, anchor)}
              />
            ))}
          </div>
        )}
        {items.map((item, index) => (
          <TimelineRow
            key={item.kind === "event" ? `e${item.event.id}` : `${item.kind}${index}`}
            item={item}
            first={index === 0}
            last={index === items.length - 1}
            past={
              isToday
                ? item.kind !== "now" && item.end <= nowMinutes
                : day < getDateStart(Date.now())
            }
            onPeek={peek}
            onSchedule={scheduleGap}
            calendars={calendars}
            decorOf={decorOf}
          />
        ))}
      </div>

      <QuickAdd day={day} />
    </div>
  );
}

function TimelineRow({
  item,
  first,
  last,
  past,
  onPeek,
  onSchedule,
  calendars,
  decorOf,
}: {
  item: TimelineItem;
  first: boolean;
  last: boolean;
  past: boolean;
  onPeek: (event: CalendarEvent, anchor: HTMLElement) => void;
  onSchedule: (start: number) => void;
  calendars: ReturnType<typeof useCalendarStore.getState>["calendars"];
  decorOf: ReturnType<typeof useEventDecor>;
}) {
  const at = item.kind === "now" ? item.at : item.start;
  const rail = (
    <span className="relative flex justify-center">
      <span
        className={cn(
          "bg-sunken absolute w-0.5 rounded-full",
          first ? "top-3.5" : "top-0",
          last ? "h-3.5" : "bottom-0"
        )}
      />
      {item.kind === "event" && (
        <i className="relative mt-[11px] size-2.5 rounded-full bg-[var(--cal)] shadow-[0_0_0_3px_var(--tau-bg-surface)]" />
      )}
      {item.kind === "gap" && (
        <i className="bg-surface relative mt-[11px] size-2.5 rounded-full shadow-[inset_0_0_0_1.5px_var(--tau-bg-track),0_0_0_3px_var(--tau-bg-surface)]" />
      )}
      {item.kind === "now" && (
        <i className="bg-accent relative mt-[10px] size-3 rounded-full shadow-[0_0_0_3px_var(--tau-bg-surface),0_0_0_5px_var(--tau-accent-soft)]" />
      )}
    </span>
  );

  return (
    <div
      style={item.kind === "event" ? eventToneStyle(item.event, calendars) : undefined}
      className={cn(
        "grid min-h-10 grid-cols-[46px_14px_minmax(0,1fr)] gap-2.5",
        item.kind === "event" && TONE,
        past && item.kind === "event" && "opacity-55"
      )}
    >
      <span
        className={cn(
          "font-tau-mono pt-[9px] text-right text-[11.5px] tabular-nums",
          item.kind === "now"
            ? "text-accent-text font-semibold"
            : item.kind === "gap"
              ? "text-ink-3"
              : "text-ink-2"
        )}
      >
        {formatTime(at)}
      </span>
      {rail}
      {item.kind === "event" && (
        <div
          onClick={e => onPeek(item.event, e.currentTarget)}
          className={cn(
            "my-[3px] cursor-pointer rounded-[10px] px-2.5 py-1.5 transition-[filter] hover:brightness-[0.97]",
            TONE_SOFT_BG
          )}
        >
          <EventTitle
            event={item.event}
            decor={decorOf(item.event)}
            className="text-tau-body font-medium"
          />
          <span className="text-ink-2 font-tau-mono text-[11px] tabular-nums">
            {formatTime(item.start)} – {formatTime(item.end)} ·{" "}
            {calendars.find(c => c.id === item.event.calendarId)?.title}
          </span>
        </div>
      )}
      {item.kind === "gap" && (
        <button
          type="button"
          onClick={() => onSchedule(item.start)}
          className="text-ink-3 hover:text-ink-2 hover:bg-hover text-tau-sm my-[3px] rounded-[10px] border border-dashed border-[var(--tau-bg-track)] px-2.5 py-[5px] text-left"
        >
          空档 {hours(item.end - item.start)} · 点击安排
        </button>
      )}
      {item.kind === "now" && (
        <span className="text-accent-text font-tau-mono pt-[9px] text-[11.5px] font-semibold">
          现在
        </span>
      )}
    </div>
  );
}

/** 底部快速添加：输入即解析，命中片段以标签回显；回车创建 */
function QuickAdd({ day }: { day: number }) {
  const calendars = useCalendarStore(s => s.calendars);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

  const candidates = useMemo(
    () => calendars.filter(c => !c.isInSystemGroup && !c.archived),
    [calendars]
  );
  const parsed = useMemo(
    () => (text.trim() ? parseQuickAdd(text, { baseDate: day, calendars: candidates }) : null),
    [text, day, candidates]
  );
  const calendar = parsed?.calendarId
    ? candidates.find(c => c.id === parsed.calendarId)
    : candidates[0];

  const submit = async () => {
    if (!parsed || saving) return;
    if (!parsed.title) {
      toast.warning("请写上日程标题");
      return;
    }
    if (!calendar) {
      toast.warning("请先创建一个日历");
      return;
    }
    const timed = parsed.startTime !== null;
    setSaving(true);
    try {
      await useCalendarStore.getState().createEvent({
        title: parsed.title,
        calendarId: calendar.id,
        detailContentId: 0,
        startDate: parsed.date,
        endDate: timed ? parsed.date : null,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        color: null,
        allDay: !timed,
      });
      const d = new Date(parsed.date);
      toast.success(`已添加到 ${d.getMonth() + 1}月${d.getDate()}日 · ${calendar.title}`);
      setText("");
    } catch (error) {
      console.error("Failed to quick add event:", error);
      toast.error("添加失败");
    } finally {
      setSaving(false);
    }
  };

  const whenLabel = parsed
    ? (() => {
        const d = new Date(parsed.date);
        const dayText =
          parsed.date === day && !parsed.hints.date ? "" : `${d.getMonth() + 1}/${d.getDate()} `;
        return parsed.startTime !== null
          ? `${dayText}${formatTime(parsed.startTime)}–${formatTime(parsed.endTime!)}`
          : `${dayText}全天`.trim();
      })()
    : "";

  return (
    <div className="flex-none px-3.5 pb-3.5">
      <div
        className={cn(
          "border-line-1 flex min-h-[38px] items-center gap-2 rounded-[10px] border pl-3 pr-2 transition-shadow",
          focused && "border-accent shadow-[var(--tau-focus-ring)]"
        )}
      >
        <Plus className="text-ink-3 size-4 shrink-0" strokeWidth={1.75} />
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
            if (e.key === "Escape" && text) {
              e.stopPropagation();
              setText("");
            }
          }}
          disabled={saving}
          placeholder="快速添加：明天 3 点 评审 #工作"
          className="text-tau-body placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
        />
        {parsed && <CornerDownLeft className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />}
      </div>
      {parsed && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 px-1">
          <span className="bg-accent-soft text-accent-text text-tau-micro rounded-full px-2 py-px">
            {whenLabel}
          </span>
          {calendar && (
            <span
              style={eventToneStyle(
                { calendarId: calendar.id, color: null } as CalendarEvent,
                calendars
              )}
              className={cn(
                "text-tau-micro rounded-full px-2 py-px text-[color-mix(in_srgb,var(--cal)_78%,var(--tau-ink-1))]",
                TONE,
                TONE_SOFT_BG,
                !parsed.hints.calendar && "opacity-70"
              )}
            >
              {calendar.title}
            </span>
          )}
          {parsed.title && (
            <span className="text-ink-3 text-tau-micro truncate">「{parsed.title}」</span>
          )}
        </div>
      )}
    </div>
  );
}
