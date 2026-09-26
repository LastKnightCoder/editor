/**
 * 月视图（方案 C：整块大面板 + 格内细线，含邻月日期）。
 *
 * 交互：单击格子 = 选中这一天（右栏当日时间线跟随）；双击 = 新建全天日程；
 * 拖过多天 = 新建跨天日程；点日程 = 速览浮层。
 * 布局：所有日程参与 assignMonthViewLevels 统一分层（legacy 算法原样复用），
 * 全天 / 跨天画软底条，单日定时画色点行；放不下的收进「还有 N 项」。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, cn, toast } from "@tau/ui";
import useCalendarStore from "@/stores/useCalendarStore";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useDateRangeDrag } from "@/hooks/useDateRangeDrag";
import { getDateStart, getMonthGridRange, isToday } from "@/utils/calendar";
import { assignMonthViewLevels, type MonthEventSpan } from "@/utils/eventLayoutAlgorithm";
import { usePeekStore } from "../../peekStore";
import { AllDayBar, TimedChip } from "../EventChips";
import { useEventDecor } from "../EventTitle";
import { AgendaRow } from "../AgendaRow";

/** 日期行高度（事件条从这里往下排） */
const DATE_AREA = 32;
/** 每层事件占位：20px 条 + 2px 间距 */
const LEVEL_HEIGHT = 22;
/** 「还有 N 项」行高 */
const MORE_HEIGHT = 20;
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

type SpanType = MonthEventSpan["spanType"];
type GridSpan = Omit<MonthEventSpan, "eventId">;

/** 按网格下标切成逐行的条 */
function spansBetween(startIndex: number, endIndex: number) {
  const spans: GridSpan[] = [];
  const startRow = Math.floor(startIndex / 7);
  const endRow = Math.floor(endIndex / 7);
  for (let row = startRow; row <= endRow; row++) {
    const startCol = row === startRow ? startIndex % 7 : 0;
    const endCol = row === endRow ? endIndex % 7 : 6;
    const spanType: SpanType =
      startRow === endRow
        ? "single"
        : row === startRow
          ? "start"
          : row === endRow
            ? "end"
            : "middle";
    spans.push({ startCol, endCol, row, width: endCol - startCol + 1, spanType });
  }
  return spans;
}

const MonthView = () => {
  const currentDate = useCalendarStore(s => s.currentDate);
  const calendars = useCalendarStore(s => s.calendars);
  const editingEvent = useCalendarStore(s => s.editingEvent);
  const { setEditingEvent, setCurrentDate } = useCalendarStore.getState();
  const peek = usePeekStore(s => s.peek);
  const { events } = useCalendarEvents();
  const decorOf = useEventDecor(events);

  const [moreDay, setMoreDay] = useState<number | null>(null);
  const [pending, setPending] = useState<{ start: number; end: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  // 当编辑对话框关闭时，清除待创建占位
  useEffect(() => {
    if (!editingEvent) setPending(null);
  }, [editingEvent]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const date = new Date(currentDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const selectedDay = getDateStart(currentDate);

  // 网格：首周周一起，含邻月日期，每格一个自然日时间戳
  const { grid, totalRows } = useMemo(() => {
    const range = getMonthGridRange(year, month);
    const first = new Date(range.start);
    const cells = Array.from({ length: range.rows * 7 }, (_, i) =>
      new Date(first.getFullYear(), first.getMonth(), first.getDate() + i).getTime()
    );
    return { grid: cells, totalRows: range.rows };
  }, [year, month]);
  const gridIndex = (ts: number) => grid.indexOf(getDateStart(ts));

  const eventsOfDay = (day: number) =>
    (events ?? []).filter(event => {
      const start = getDateStart(event.startDate);
      const end = event.endDate ? getDateStart(event.endDate) : start;
      return day >= start && day <= end;
    });

  // 所有日程裁到网格范围内切段，参与统一分层
  const layoutInput = useMemo(() => {
    const first = grid[0];
    const last = grid[grid.length - 1];
    return (events ?? []).flatMap(event => {
      const start = Math.max(getDateStart(event.startDate), first);
      const end = Math.min(event.endDate ? getDateStart(event.endDate) : start, last);
      if (end < first || start > last) return [];
      const spans = spansBetween(gridIndex(start), gridIndex(end)).map(span => ({
        ...span,
        eventId: event.id,
      }));
      return [{ event, spans }];
    });
    // gridIndex 依赖 grid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, grid]);

  const rowLayout = useMemo(() => {
    const rowHeight = containerHeight / totalRows;
    // 可用于事件的高度（预留「还有 N 项」的空间）
    const maxLevels = Math.max(1, Math.floor((rowHeight - DATE_AREA - MORE_HEIGHT) / LEVEL_HEIGHT));
    const result = assignMonthViewLevels(layoutInput, maxLevels, "durationFirst");
    const byId = new Map(layoutInput.map(item => [item.event.id, item.event]));
    return Array.from(result.values()).flatMap(items =>
      items.flatMap(item => {
        const event = byId.get(item.eventId);
        return event ? [{ event, span: item.span, level: item.level }] : [];
      })
    );
  }, [layoutInput, containerHeight, totalRows]);

  const createAllDay = (start: number, end: number) => {
    const target = calendars.find(c => !c.isInSystemGroup && !c.archived);
    if (!target) {
      toast.warning("请先创建一个日历");
      return;
    }
    setPending({ start, end });
    setEditingEvent({
      id: 0,
      createTime: Date.now(),
      updateTime: Date.now(),
      calendarId: target.id,
      title: "",
      detailContentId: 0,
      startDate: start,
      endDate: start === end ? null : end,
      startTime: null,
      endTime: null,
      color: null,
      allDay: true,
    });
  };

  // 拖过两天及以上才建跨天日程；原地按下抬起交给 click / dblclick
  const { isDragging, selectedRange, handleMouseDown, handleMouseEnter, handleMouseUp } =
    useDateRangeDrag({
      onSelect: (a, b) => {
        if (a !== b) createAllDay(grid[a], grid[b]);
      },
    });

  useEffect(() => {
    if (!isDragging) return;
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [isDragging, handleMouseUp]);

  const cellWidth = 100 / 7;
  const rowPercent = 100 / totalRows;
  const lastRowStart = (totalRows - 1) * 7;
  const barPosition = (span: GridSpan, level: number) => ({
    left: `calc(${span.startCol * cellWidth}% + 4px)`,
    width: `calc(${span.width * cellWidth}% - 8px)`,
    top: `calc(${span.row * rowPercent}% + ${DATE_AREA + level * LEVEL_HEIGHT}px)`,
  });

  const previewSpans =
    isDragging && selectedRange && selectedRange.start !== selectedRange.end
      ? spansBetween(selectedRange.start, selectedRange.end)
      : pending && gridIndex(pending.start) >= 0
        ? spansBetween(
            gridIndex(pending.start),
            Math.max(gridIndex(pending.start), gridIndex(pending.end))
          )
        : [];

  const moreList =
    moreDay !== null
      ? eventsOfDay(moreDay).sort((a, b) => {
          if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
          return (a.startTime ?? Infinity) - (b.startTime ?? Infinity);
        })
      : [];

  return (
    <div className="flex h-full flex-col pb-4 pl-1.5 pr-[18px] pt-1">
      <div className="grid flex-none grid-cols-7 pb-1.5 pt-2">
        {WEEKDAYS.map(day => (
          <span key={day} className="text-ink-3 pl-2.5 text-[12px]">
            周{day}
          </span>
        ))}
      </div>

      <div
        ref={containerRef}
        className="relative grid min-h-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))` }}
      >
        {grid.map((day, index) => {
          const outside = new Date(day).getMonth() !== month - 1;
          const selected = day === selectedDay;
          const col = index % 7;
          const shown = new Set(
            rowLayout
              .filter(
                item =>
                  item.span.row === Math.floor(index / 7) &&
                  col >= item.span.startCol &&
                  col <= item.span.endCol
              )
              .map(item => item.event.id)
          ).size;
          const moreCount = eventsOfDay(day).length - shown;

          return (
            <div
              key={day}
              onClick={() => {
                if (!isDragging && day !== selectedDay) setCurrentDate(day);
              }}
              onDoubleClick={() => createAllDay(day, day)}
              onMouseDown={handleMouseDown(index)}
              onMouseEnter={() => handleMouseEnter(index)}
              className={cn(
                "border-line-2 relative flex cursor-pointer select-none flex-col transition-colors duration-[160ms]",
                col !== 6 && "border-r",
                index < lastRowStart && "border-b",
                selected ? "bg-selected" : "hover:bg-hover"
              )}
            >
              <div className="flex h-[30px] items-center px-2 pt-1">
                <span
                  className={cn(
                    "font-tau-mono grid h-[22px] min-w-[22px] place-items-center rounded-full px-[5px] text-[12px] tabular-nums",
                    outside ? "text-ink-3" : "text-ink-2",
                    isToday(day) && "bg-accent text-ink-inverse font-semibold"
                  )}
                >
                  {new Date(day).getDate()}
                </span>
              </div>
              <div className="flex-1" />
              {moreCount > 0 && (
                <button
                  type="button"
                  className="text-ink-2 hover:text-ink-1 flex h-5 shrink-0 items-center px-[11px] text-[11.5px]"
                  onClick={e => {
                    e.stopPropagation();
                    setMoreDay(day);
                  }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  还有 {moreCount} 项
                </button>
              )}
            </div>
          );
        })}

        {/* 事件层：全天 / 跨天 = 软底色条；单日定时 = 色点 + 时间 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {rowLayout.map(({ event, span, level }) => {
            const common = {
              event,
              calendars,
              decor: decorOf(event),
              onClick: (anchor: HTMLElement) => peek(event, anchor),
              className: "pointer-events-auto absolute",
              style: { ...barPosition(span, level), zIndex: 10 + level },
            };
            const multiDay =
              event.endDate !== null &&
              getDateStart(event.endDate) !== getDateStart(event.startDate);
            return event.allDay || multiDay ? (
              <AllDayBar
                key={`${event.id}-${span.row}`}
                {...common}
                continuesLeft={span.spanType === "middle" || span.spanType === "end"}
                continuesRight={span.spanType === "middle" || span.spanType === "start"}
              />
            ) : (
              <TimedChip key={`${event.id}-${span.row}`} {...common} />
            );
          })}

          {/* 拖拽预览 / 待创建占位 */}
          {previewSpans.map((span, idx) => (
            <div
              key={`preview-${idx}`}
              className={cn(
                "border-accent bg-accent-soft absolute z-[49] h-5 rounded-[6px] border-[1.5px] border-dashed",
                (span.spanType === "middle" || span.spanType === "end") &&
                  "rounded-l-none border-l-0",
                (span.spanType === "middle" || span.spanType === "start") &&
                  "rounded-r-none border-r-0"
              )}
              style={barPosition(span, 0)}
            />
          ))}
        </div>
      </div>

      <Dialog
        open={moreDay !== null}
        onOpenChange={next => {
          if (!next) setMoreDay(null);
        }}
        title={
          moreDay !== null
            ? `${new Date(moreDay).getMonth() + 1} 月 ${new Date(moreDay).getDate()} 日`
            : ""
        }
        subtitle={`${moreList.length} 项日程`}
        size="lg"
      >
        <div className="-mx-2.5 flex flex-col gap-0.5">
          {moreList.map(event => (
            <AgendaRow
              key={event.id}
              event={event}
              calendars={calendars}
              decor={decorOf(event)}
              onClick={() => {
                setMoreDay(null);
                setEditingEvent(event);
              }}
            />
          ))}
        </div>
      </Dialog>
    </div>
  );
};

export default MonthView;
