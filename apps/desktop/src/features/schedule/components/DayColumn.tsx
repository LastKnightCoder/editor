/**
 * 当日时间线（方案 C，承载在日程页右侧非模态抽屉里）：选中日 = store.currentDate（月视图点格子 / 周视图点日期头切换）。
 *
 * 大号日期 → 标记区（全天日程、截止、周期打卡）→ 定时日程时间线 → 底部自然语言快速添加（quickAdd.ts 解析，回车直接创建）。
 * 时间线按账本呈现（ledger.ts）：已结束 = 记录（实心），未开始 = 计划（空心），跨过现在在现在处切开；
 * 过去两条日程之间 ≥15 分钟的空隙可就地补记；今天之后 08:00–22:00 内 ≥1 小时的空档显示「点击安排」。
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CornerDownLeft, Plus } from "lucide-react";
import { IconButton, cn, toast } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { useScheduleStore } from "../uiStore";
import {
  useCalendarCatalog,
  useCalendarEvents,
  useCalendarRoles,
  useScheduleMutations,
} from "../queries";
import { formatTime, getDateStart } from "@/utils/calendar";
import type { Calendar, CalendarEvent } from "@/types";
import { PLAN_OUTLINE, TONE, TONE_SOFT_BG, eventToneStyle, ledgerFill } from "../eventTone";
import { buildDayTimeline, isMarker, type TimelineItem } from "../ledger";
import { usePeekStore } from "../peekStore";
import { extractCalendarTag, parseQuickAdd } from "../quickAdd";
import { AllDayBar } from "./EventChips";
import { EventTitle, useEventDecor } from "./EventTitle";
import { useNowMinutes } from "./TimeGridParts";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const hours = (minutes: number) => `${Number((minutes / 60).toFixed(1))} 小时`;

/** 标记排序：全天在前，定时标记（截止时刻）按时刻在后 */
const markerOrder = (event: CalendarEvent) => (event.allDay ? -1 : (event.startTime ?? 0));

/** 选中日（store.currentDate）及其日程：当日时间线与工具条的当日按钮共用 */
export function useDayEvents() {
  const currentDate = useScheduleStore(s => s.currentDate);
  const { events } = useCalendarEvents();
  const day = getDateStart(currentDate);
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
  return { day, isToday, dayEvents };
}

/** 可写入的用户日历（排除系统日历与已归档），首个为默认 */
function useWritableCalendars() {
  const { calendars } = useCalendarCatalog();
  return useMemo(() => calendars.filter(c => !c.isInSystemGroup && !c.archived), [calendars]);
}

export function DayColumn() {
  const { calendars } = useCalendarCatalog();
  const writable = useWritableCalendars();
  const roles = useCalendarRoles();
  const { createEvent } = useScheduleMutations();
  const { setCurrentDate, setEditingEvent } = useScheduleStore.getState();
  const peek = usePeekStore(s => s.peek);
  const nowMinutes = useNowMinutes();
  const { day, isToday, dayEvents } = useDayEvents();
  const date = new Date(day);
  const decorOf = useEventDecor(dayEvents);
  // 分钟精度，随 useNowMinutes 的 tick 推进
  const nowMs = getDateStart(Date.now()) + nowMinutes * 60_000;

  const { markers, blocks } = useMemo(() => {
    const markers: CalendarEvent[] = [];
    const blocks: CalendarEvent[] = [];
    for (const event of dayEvents) (isMarker(event, roles) ? markers : blocks).push(event);
    markers.sort((a, b) => markerOrder(a) - markerOrder(b));
    return { markers, blocks };
  }, [dayEvents, roles]);

  const items = useMemo(
    () => buildDayTimeline({ day, events: blocks, nowMs }),
    [day, blocks, nowMs]
  );

  const busy = items.reduce(
    (sum, item) => (item.kind === "event" ? sum + item.end - item.start : sum),
    0
  );
  const total = dayEvents.length;

  const defaultCalendar = writable[0];

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

  /** 补记过去空隙：时间以空隙为准，文本只摘 `#日历`，其余原样作标题 */
  const recordGap = async (start: number, end: number, text: string) => {
    const { rest, calendarId } = extractCalendarTag(text, writable);
    const title = rest.replace(/\s+/g, " ").trim();
    const calendar = writable.find(c => c.id === calendarId) ?? defaultCalendar;
    if (!title) {
      toast.warning("请写上做了什么");
      return false;
    }
    if (!calendar) {
      toast.warning("请先创建一个日历");
      return false;
    }
    try {
      await createEvent({
        title,
        calendarId: calendar.id,
        detailContentId: 0,
        startDate: day,
        endDate: day,
        startTime: start,
        endTime: end,
        color: null,
        allDay: false,
      });
      return true;
    } catch (error) {
      console.error("Failed to record gap:", error);
      toast.error("补记失败");
      return false;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* pr-12：给抽屉右上角浮着的 × 让位 */}
      <div className="flex items-end gap-3 pb-2 pl-6 pr-12 pt-5">
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
      <p className="text-ink-3 text-tau-sm px-6 pb-2.5">
        {total === 0 ? "这一天还没有安排" : `${total} 项${busy ? ` · 已排 ${hours(busy)}` : ""}`}
      </p>

      {/* FadeScroll 右侧 6px 透明边 + pr-[18px] = 24px，与标题行的 px-6 对齐 */}
      <FadeScroll className="mb-4 min-h-0 flex-1 pb-1 pl-6 pr-[18px]">
        {markers.length > 0 && (
          <div className="flex flex-col gap-1 pb-2.5 pl-[70px]">
            {markers.map(event => (
              <AllDayBar
                key={event.id}
                event={event}
                calendars={calendars}
                decor={decorOf(event)}
                onClick={() => peek(event)}
              />
            ))}
          </div>
        )}
        {items.map((item, index) => (
          <TimelineRow
            key={
              item.kind === "event"
                ? `e${item.event.id}`
                : item.kind === "now"
                  ? "now"
                  : `${item.kind}${item.start}`
            }
            item={item}
            first={index === 0}
            last={index === items.length - 1}
            onPeek={peek}
            onSchedule={scheduleGap}
            onRecord={recordGap}
            calendars={calendars}
            decorOf={decorOf}
          />
        ))}
      </FadeScroll>

      <QuickAdd day={day} />
    </div>
  );
}

function TimelineRow({
  item,
  first,
  last,
  onPeek,
  onSchedule,
  onRecord,
  calendars,
  decorOf,
}: {
  item: TimelineItem;
  first: boolean;
  last: boolean;
  onPeek: (event: CalendarEvent, anchor: HTMLElement) => void;
  onSchedule: (start: number) => void;
  onRecord: (start: number, end: number, text: string) => Promise<boolean>;
  calendars: Calendar[];
  decorOf: ReturnType<typeof useEventDecor>;
}) {
  const at = item.kind === "now" ? item.at : item.start;
  const gap = item.kind === "record-gap" || item.kind === "plan-gap";
  const recorded = item.kind === "event" && item.phase.kind === "record";
  const rail = (
    <span className="relative flex justify-center">
      <span
        className={cn(
          // 轨道色：sunken 在暗色下近黑（#100d08），竖线会成一道黑缝
          "bg-track absolute w-0.5 rounded-full",
          first ? "top-3.5" : "top-0",
          last ? "h-3.5" : "bottom-0"
        )}
      />
      {item.kind === "event" && (
        <i
          className={cn(
            "relative mt-[11px] size-2.5 rounded-full",
            // 记录实心圆点，计划 / 进行中空心环
            recorded
              ? "bg-[var(--cal)] shadow-[0_0_0_3px_var(--tau-bg-surface)]"
              : "bg-surface shadow-[inset_0_0_0_1.5px_var(--cal),0_0_0_3px_var(--tau-bg-surface)]"
          )}
        />
      )}
      {gap && (
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
        item.kind === "event" && TONE
      )}
    >
      <span
        className={cn(
          "font-tau-mono pt-[9px] text-right text-[11.5px] tabular-nums",
          item.kind === "now" ? "text-accent-text font-semibold" : gap ? "text-ink-3" : "text-ink-2"
        )}
      >
        {formatTime(at)}
      </span>
      {rail}
      {item.kind === "event" && (
        <EventCard
          item={item}
          recorded={recorded}
          onPeek={onPeek}
          calendars={calendars}
          decorOf={decorOf}
        />
      )}
      {item.kind === "plan-gap" && (
        <button
          type="button"
          onClick={() => onSchedule(item.start)}
          className={cn("text-ink-3 hover:text-ink-2 hover:bg-hover text-left", GAP_FRAME)}
        >
          空档 {hours(item.end - item.start)} · 点击安排
        </button>
      )}
      {item.kind === "record-gap" && (
        <RecordGap start={item.start} end={item.end} onRecord={onRecord} />
      )}
      {item.kind === "now" && (
        <span className="text-accent-text font-tau-mono pt-[9px] text-[11.5px] font-semibold">
          现在
        </span>
      )}
    </div>
  );
}

const GAP_FRAME =
  "text-tau-sm my-[3px] rounded-[10px] border border-dashed border-[var(--tau-bg-track)] px-2.5 py-[5px]";

function EventCard({
  item,
  recorded,
  onPeek,
  calendars,
  decorOf,
}: {
  item: Extract<TimelineItem, { kind: "event" }>;
  recorded: boolean;
  onPeek: (event: CalendarEvent, anchor: HTMLElement) => void;
  calendars: Calendar[];
  decorOf: ReturnType<typeof useEventDecor>;
}) {
  const fill = ledgerFill(item.phase);
  return (
    <div
      onClick={e => onPeek(item.event, e.currentTarget)}
      // 计划描边取数据色；记录无描边，软底即边界
      style={{ ...fill.style, borderColor: recorded ? "transparent" : PLAN_OUTLINE }}
      className={cn(
        "ease-tau-out hover:shadow-lift my-[3px] cursor-pointer rounded-[10px] border px-2.5 py-1.5 transition-shadow duration-200",
        fill.className
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
  );
}

/** 过去空隙：点击原位输入，回车按空隙起止补记一条日程 */
function RecordGap({
  start,
  end,
  onRecord,
}: {
  start: number;
  end: number;
  onRecord: (start: number, end: number, text: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const range = `${formatTime(start)}–${formatTime(end)}`;

  const cancel = () => {
    setEditing(false);
    setText("");
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onRecord(start, end, text);
    setSaving(false);
    if (ok) cancel();
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn("text-ink-3 hover:text-ink-2 hover:bg-hover text-left", GAP_FRAME)}
      >
        + 补记 {range}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={text}
      disabled={saving}
      aria-label={`补记 ${range}`}
      placeholder={`${range} 做了什么？回车补记`}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit();
        if (e.key === "Escape") {
          e.stopPropagation();
          cancel();
        }
      }}
      // 失焦时空内容收起；已写的内容保留在输入态，不丢字
      onBlur={() => {
        if (!text.trim()) cancel();
      }}
      className={cn(
        "bg-surface text-tau-body placeholder:text-ink-3 border-accent text-ink-1 border-solid outline-none",
        GAP_FRAME
      )}
    />
  );
}

/** 底部快速添加：输入即解析，命中片段以标签回显；回车创建 */
function QuickAdd({ day }: { day: number }) {
  const { calendars } = useCalendarCatalog();
  const candidates = useWritableCalendars();
  const { createEvent } = useScheduleMutations();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

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
      await createEvent({
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
    <div className="flex-none px-6 pb-5">
      <div
        className={cn(
          "border-line-1 bg-surface flex min-h-[38px] items-center gap-2 rounded-[10px] border pl-3 pr-2 transition-shadow",
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
