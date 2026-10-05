import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
} from "react";
import dayjs from "dayjs";
import { cn, toast } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import { useScheduleStore } from "../../uiStore";
import {
  useCalendarCatalog,
  useCalendarEvents,
  useCalendarRoles,
  usePomodoroBindings,
  useScheduleMutations,
} from "../../queries";
import { useEventDrag, type EventDragDraft } from "@/hooks/useEventDrag";
import {
  DROP_MINUTES,
  dropMinutes,
  isTodoDrag,
  readTodoDrag,
  useScheduleTodo,
} from "../../todoDrop";
import { absorbFocus, eventPhase, isMarker, type FocusSpan } from "../../ledger";
import { isEditableEvent, toneStyle } from "../../eventTone";
import { useTimeSlotDrag } from "@/hooks/useTimeSlotDrag";
import { useEventOverlap } from "@/hooks/useEventOverlap";
import { getWeekStart, isToday, getDateStart } from "@/utils/calendar";
import { assignWeekViewLevels } from "@/utils/eventLayoutAlgorithm";
import type { Calendar, CalendarEvent } from "@/types";
import { usePeekStore } from "../../peekStore";
import { AllDayBar, TimedBlock } from "../EventChips";
import { useEventDecor, type EventDecor } from "../EventTitle";
import {
  CELL_HEIGHT,
  DragRange,
  GRID_HEIGHT,
  GUTTER,
  HourGutter,
  HourLines,
  NowLine,
  PendingRange,
  minutesToPx,
  useNowMinutes,
  useScrollToNow,
} from "../TimeGridParts";

interface PendingWeekEvent {
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
}

const WEEKDAY_NAMES = ["一", "二", "三", "四", "五", "六", "日"];
const LANE = 22;

const WeekView = () => {
  const currentDate = useScheduleStore(s => s.currentDate);
  const { calendars } = useCalendarCatalog();
  const editingEvent = useScheduleStore(s => s.editingEvent);
  const setEditingEvent = useScheduleStore(s => s.setEditingEvent);
  const setCurrentDate = useScheduleStore(s => s.setCurrentDate);
  const peek = usePeekStore(s => s.peek);
  const { events } = useCalendarEvents();
  const roles = useCalendarRoles();

  const [pendingEvent, setPendingEvent] = useState<PendingWeekEvent | null>(null);
  const { updateEvent } = useScheduleMutations();
  const scheduleTodo = useScheduleTodo();
  const gridRef = useRef<HTMLDivElement>(null);
  const nowMinutes = useNowMinutes();
  const scrollRef = useScrollToNow(currentDate);
  const decorOf = useEventDecor(events);
  const bindings = usePomodoroBindings(events);
  // 专注条取番茄钟日历色
  const focusTone = useMemo(() => {
    const calendar = calendars.find(c => roles.get(c.id) === "pomodoro");
    return calendar ? toneStyle(calendar.color) : undefined;
  }, [calendars, roles]);

  // 当编辑对话框关闭时，清除待创建事件高亮
  useEffect(() => {
    if (!editingEvent) setPendingEvent(null);
  }, [editingEvent]);

  const weekStart = getWeekStart(currentDate);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        return date;
      }),
    [weekStart]
  );

  const createAt = (dayIndex: number, startMinutes: number, endMinutes: number) => {
    const target = calendars.find(c => !c.isInSystemGroup && !c.archived);
    if (!target) {
      toast.warning("请先创建一个日历");
      return;
    }
    setPendingEvent({ dayIndex, startMinutes, endMinutes });
    const dayStart = getDateStart(weekDays[dayIndex].getTime());
    setEditingEvent({
      id: 0,
      createTime: Date.now(),
      updateTime: Date.now(),
      calendarId: target.id,
      title: "",
      detailContentId: 0,
      startDate: dayStart,
      endDate: dayStart,
      startTime: startMinutes,
      endTime: endMinutes,
      color: null,
      allDay: false,
    });
  };

  // 定时日程按天分列（标记不进时间网格）；绑定日程内的番茄收进日程画专注条
  const dayTimedEventsLists = useMemo(
    () =>
      weekDays.map(day => {
        const dayDate = getDateStart(day.getTime());
        return absorbFocus(
          (events ?? []).filter(
            event => !isMarker(event, roles) && getDateStart(event.startDate) === dayDate
          ),
          bindings,
          roles
        );
      }),
    [weekDays, events, roles, bindings]
  );

  // 拖动日程块：松手按新列 / 新时段整行更新（跨天的定时日程不参与拖动）
  const dayIndexAt = (clientX: number) => {
    const cols = gridRef.current?.querySelectorAll<HTMLElement>("[data-week-col]");
    let index = 0;
    cols?.forEach((col, i) => {
      if (clientX >= col.getBoundingClientRect().left) index = i;
    });
    return index;
  };
  const eventDrag = useEventDrag({
    cellHeight: CELL_HEIGHT,
    dayIndexAt,
    onCommit: (eventId, next) => {
      const event = events.find(e => e.id === eventId);
      if (!event) return;
      const startDate = getDateStart(weekDays[next.dayIndex].getTime());
      void updateEvent({
        ...event,
        startDate,
        endDate: event.endDate == null ? null : startDate,
        startTime: next.start,
        endTime: next.end,
      }).catch(() => toast.error("调整时间失败"));
    },
  });
  const columns = useMemo(
    () => withDraft(dayTimedEventsLists, eventDrag.draft, weekDays),
    [dayTimedEventsLists, eventDrag.draft, weekDays]
  );

  // 全天车道放全部标记（全天日程、截止、周期打卡）：跨天条与单日条共用一套分层
  const allDayEvents = useMemo(
    () => (events ?? []).filter(event => isMarker(event, roles)),
    [events, roles]
  );
  const eventLevels = useMemo(
    () => assignWeekViewLevels(allDayEvents, weekDays[0]),
    [allDayEvents, weekDays]
  );
  const laneCount = allDayEvents.length ? Math.max(0, ...Array.from(eventLevels.values())) + 1 : 0;

  const allDayPlacements = useMemo(() => {
    const weekStartDay = dayjs(weekDays[0]);
    return allDayEvents
      .map(event => {
        const start = dayjs(event.startDate);
        const end = event.endDate ? dayjs(event.endDate) : start;
        const startOffset = start.startOf("day").diff(weekStartDay, "day");
        const endOffset = end.startOf("day").diff(weekStartDay, "day");
        if (startOffset > 6 || endOffset < 0) return null;
        return {
          event,
          level: eventLevels.get(event.id) || 0,
          startCol: Math.max(0, startOffset),
          endCol: Math.min(6, endOffset),
          continuesLeft: startOffset < 0,
          continuesRight: endOffset > 6,
        };
      })
      .filter(p => p !== null);
  }, [allDayEvents, eventLevels, weekDays]);

  return (
    <div className="flex h-full flex-col">
      {/* 日期头 */}
      <div className="flex flex-none pb-1.5 pr-3 pt-3">
        <div className={GUTTER} />
        {weekDays.map((day, index) => {
          const today = isToday(day.getTime());
          const selected = getDateStart(day.getTime()) === getDateStart(currentDate);
          return (
            <button
              type="button"
              key={index}
              title="在右栏查看这一天"
              onClick={() => setCurrentDate(day.getTime())}
              className={cn(
                "text-ink-3 hover:bg-hover mx-0.5 flex flex-1 items-baseline gap-1.5 rounded-[8px] py-0.5 pl-2 text-[12px]",
                today && "text-accent-text",
                selected && "bg-selected hover:bg-selected"
              )}
            >
              <b
                className={cn(
                  "font-tau-mono text-ink-1 text-[17px] font-medium tabular-nums",
                  today && "text-accent-text font-semibold"
                )}
              >
                {day.getDate()}
              </b>
              周{WEEKDAY_NAMES[index]}
            </button>
          );
        })}
      </div>

      {/* 全天车道 */}
      <div className="flex flex-none pb-1.5 pr-3">
        <span className={cn("text-ink-3 pr-2 pt-0.5 text-right text-[11px]", GUTTER)}>全天</span>
        <div className="relative flex-1" style={{ height: Math.max(1, laneCount) * LANE }}>
          {allDayPlacements.map(p => (
            <AllDayBar
              key={p.event.id}
              event={p.event}
              calendars={calendars}
              decor={decorOf(p.event)}
              onClick={() => peek(p.event)}
              continuesLeft={p.continuesLeft}
              continuesRight={p.continuesRight}
              className="absolute"
              style={{
                top: p.level * LANE,
                left: `calc(${(p.startCol / 7) * 100}% + 2px)`,
                width: `calc(${((p.endCol - p.startCol + 1) / 7) * 100}% - 4px)`,
              }}
            />
          ))}
        </div>
      </div>

      {/* 时间网格：离纸底留 16px，滚动条不贴纸缘；
          FadeScroll 右侧 6px 透明边 + pr-1.5 合计 12px，与日期头 / 全天车道的 pr-3 对齐 */}
      <FadeScroll scrollRef={scrollRef} className="mb-4 mt-2 min-h-0 flex-1 pr-1.5">
        <div ref={gridRef} className="flex" style={{ height: GRID_HEIGHT }}>
          <HourGutter />
          {weekDays.map((day, dayIndex) => (
            <WeekDayColumn
              key={dayIndex}
              day={day}
              events={columns[dayIndex].blocks}
              focus={columns[dayIndex].focus}
              draggingId={eventDrag.draft?.eventId ?? null}
              canDrag={event =>
                isEditableEvent(event, calendars) &&
                (event.endDate == null || event.endDate === event.startDate)
              }
              onDragStart={(e, event, mode) =>
                eventDrag.start(
                  e,
                  {
                    eventId: event.id,
                    dayIndex,
                    start: event.startTime ?? 0,
                    end: event.endTime ?? (event.startTime ?? 0) + 60,
                  },
                  mode
                )
              }
              consumeClick={eventDrag.consumeClick}
              onDropTodo={(todoId, start) =>
                void scheduleTodo(todoId, getDateStart(day.getTime()), start)
              }
              focusTone={focusTone}
              calendars={calendars}
              decorOf={decorOf}
              nowMinutes={nowMinutes}
              pending={pendingEvent?.dayIndex === dayIndex ? pendingEvent : null}
              onOpen={peek}
              onSelect={(start, end) => createAt(dayIndex, start, end)}
              first={dayIndex === 0}
            />
          ))}
        </div>
      </FadeScroll>
    </div>
  );
};

/** 拖动中的日程按草稿位置渲染：从原列移除，放进草稿列（时段换成草稿起止） */
function withDraft(
  columns: { blocks: CalendarEvent[]; focus: Map<number, FocusSpan[]> }[],
  draft: EventDragDraft | null,
  weekDays: Date[]
) {
  if (!draft) return columns;
  const dragged = columns.flatMap(c => c.blocks).find(e => e.id === draft.eventId);
  if (!dragged) return columns;
  const startDate = getDateStart(weekDays[draft.dayIndex].getTime());
  const moved: CalendarEvent = {
    ...dragged,
    startDate,
    endDate: dragged.endDate == null ? null : startDate,
    startTime: draft.start,
    endTime: draft.end,
  };
  return columns.map((column, index) => {
    const blocks = column.blocks.filter(e => e.id !== draft.eventId);
    return { ...column, blocks: index === draft.dayIndex ? [...blocks, moved] : blocks };
  });
}

/** 单日列：自持框选新建、待办拖入与重叠分列（原先 7 个 hook 在 map 里调用，拆成组件后合规） */
function WeekDayColumn({
  day,
  events,
  focus,
  draggingId,
  canDrag,
  onDragStart,
  consumeClick,
  onDropTodo,
  focusTone,
  calendars,
  decorOf,
  nowMinutes,
  pending,
  onOpen,
  onSelect,
  first,
}: {
  day: Date;
  events: CalendarEvent[];
  focus: Map<number, FocusSpan[]>;
  draggingId: number | null;
  canDrag(event: CalendarEvent): boolean;
  onDragStart(e: PointerEvent, event: CalendarEvent, mode: "move" | "resize"): void;
  consumeClick(): boolean;
  onDropTodo(todoId: number, start: number): void;
  focusTone: CSSProperties | undefined;
  calendars: Calendar[];
  decorOf: (event: CalendarEvent) => EventDecor;
  nowMinutes: number;
  pending: PendingWeekEvent | null;
  onOpen: (event: CalendarEvent, anchor: HTMLElement) => void;
  onSelect: (start: number, end: number) => void;
  first: boolean;
}) {
  const positions = useEventOverlap(events);
  const { isDragging, selectedRange, handlers } = useTimeSlotDrag({
    onSelect,
    cellHeight: CELL_HEIGHT,
    gridStartTime: 0,
  });
  const today = isToday(day.getTime());
  // 分钟精度，随 nowMinutes 的 tick 推进
  const nowMs = getDateStart(Date.now()) + nowMinutes * 60_000;
  // 待办拖入的落点预览
  const [dropAt, setDropAt] = useState<number | null>(null);
  const dropMinute = (e: DragEvent<HTMLDivElement>) =>
    dropMinutes(e.clientY - e.currentTarget.getBoundingClientRect().top, CELL_HEIGHT);

  return (
    <div
      data-week-col
      className={cn(
        "relative flex-1 cursor-cell select-none",
        !first && "shadow-[-1px_0_0_var(--tau-line-2)]",
        today && "bg-accent/[0.04]"
      )}
      {...handlers}
      onDragOver={e => {
        if (!isTodoDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        const at = dropMinute(e);
        if (at !== dropAt) setDropAt(at);
      }}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
      }}
      onDrop={e => {
        const todoId = readTodoDrag(e);
        setDropAt(null);
        if (todoId == null) return;
        e.preventDefault();
        onDropTodo(todoId, dropMinute(e));
      }}
    >
      {dropAt !== null && (
        <PendingRange start={dropAt} end={Math.min(dropAt + DROP_MINUTES, 24 * 60 - 1)} />
      )}
      <HourLines />
      {isDragging && selectedRange && (
        <DragRange start={selectedRange.start} end={selectedRange.end} />
      )}
      {pending && !isDragging && (
        <PendingRange start={pending.startMinutes} end={pending.endMinutes} />
      )}
      {today && <NowLine minutes={nowMinutes} />}

      {events.map(event => {
        const position = positions.get(event.id);
        const start = event.startTime ?? 0;
        const end = event.endTime ?? start + 60;
        const height = Math.max(minutesToPx(end - start) - 2, 20);
        return (
          <TimedBlock
            key={event.id}
            event={event}
            calendars={calendars}
            decor={decorOf(event)}
            onClick={anchor => {
              if (!consumeClick()) onOpen(event, anchor);
            }}
            compact={height < 36}
            phase={eventPhase(event, nowMs)}
            focus={focus.get(event.id)}
            focusTone={focusTone}
            drag={
              canDrag(event)
                ? {
                    onMove: e => onDragStart(e, event, "move"),
                    onResize: e => onDragStart(e, event, "resize"),
                    dragging: draggingId === event.id,
                  }
                : undefined
            }
            style={{
              top: minutesToPx(start),
              height,
              left: `calc(${position?.left ?? 0}% + 2px)`,
              width: `calc(${position?.width ?? 100}% - 5px)`,
              zIndex: position?.zIndex || 1,
            }}
          />
        );
      })}
    </div>
  );
}

export default WeekView;
