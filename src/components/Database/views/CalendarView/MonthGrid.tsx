import React, { useMemo, useState, useEffect, useRef, memo } from "react";
import dayjs from "dayjs";
import { MdClose } from "react-icons/md";
import { assignMonthViewLevels } from "@/utils/eventLayoutAlgorithm";
import { RowData } from "../../types";
import CalendarEvent from "./CalendarEvent";
import { useMemoizedFn } from "ahooks";

interface CalendarRowEvent {
  id: string;
  title: string;
  startDate: number;
  endDate: number | null;
  color: string;
  rowData: RowData;
}

interface EventSpan {
  eventId: number;
  startCol: number;
  endCol: number;
  row: number;
  width: number;
  spanType: "single" | "start" | "middle" | "end";
}

interface MonthGridProps {
  year: number;
  month: number;
  events: CalendarRowEvent[];
  theme: "light" | "dark";
  readonly: boolean;
  onEventClick: (rowData: RowData) => void;
  onDateClick: (date: number) => void;
  onDateRangeSelect: (startDate: number, endDate: number) => void;
  onEventDelete: (rowData: RowData) => void;
}

const weekDays = ["一", "二", "三", "四", "五", "六", "日"];

const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

const getFirstDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month - 1, 1).getDay();
};

const isToday = (date: number): boolean => {
  const now = Date.now();
  const dateStart = dayjs(date).startOf("day").valueOf();
  const todayStart = dayjs(now).startOf("day").valueOf();
  return dateStart === todayStart;
};

const MonthGrid: React.FC<MonthGridProps> = memo(
  ({
    year,
    month,
    events,
    readonly,
    onEventClick,
    onDateClick,
    onDateRangeSelect,
    onEventDelete,
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(0);
    const [moreEventsDay, setMoreEventsDay] = useState<number | null>(null);
    const [moreEventsList, setMoreEventsList] = useState<CalendarRowEvent[]>(
      [],
    );
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
    const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
    const [contextMenuEvent, setContextMenuEvent] =
      useState<CalendarRowEvent | null>(null);
    const [contextMenuPosition, setContextMenuPosition] = useState<{
      x: number;
      y: number;
    } | null>(null);

    // 监听容器尺寸变化
    useEffect(() => {
      if (!containerRef.current) return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });

      resizeObserver.observe(containerRef.current);

      return () => resizeObserver.disconnect();
    }, []);

    // 计算月视图的日期网格
    const dateGrid = useMemo(() => {
      const daysInMonth = getDaysInMonth(year, month);
      const firstDay = getFirstDayOfMonth(year, month);
      const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1; // 调整为周一开始

      const grid: (number | null)[] = [];

      // 填充月初的空白
      for (let i = 0; i < adjustedFirstDay; i++) {
        grid.push(null);
      }

      // 填充月份的日期
      for (let day = 1; day <= daysInMonth; day++) {
        grid.push(day);
      }

      return grid;
    }, [year, month]);

    // 计算实际的行数
    const totalRows = useMemo(() => Math.ceil(dateGrid.length / 7), [dateGrid]);

    // 获取某一天的事件
    const getEventsForDay = (day: number): CalendarRowEvent[] => {
      const dayDate = dayjs()
        .year(year)
        .month(month - 1)
        .date(day)
        .startOf("day")
        .valueOf();
      return events.filter((event) => {
        const eventStart = dayjs(event.startDate).startOf("day").valueOf();
        const eventEnd = event.endDate
          ? dayjs(event.endDate).startOf("day").valueOf()
          : eventStart;
        return dayDate >= eventStart && dayDate <= eventEnd;
      });
    };

    // 计算事件的渲染信息
    const getEventRenderInfo = (event: CalendarRowEvent) => {
      const eventStart = dayjs(event.startDate);
      const eventEnd = event.endDate ? dayjs(event.endDate) : eventStart;

      // 限制事件在当月显示的范围
      const monthStart = dayjs()
        .year(year)
        .month(month - 1)
        .startOf("month");
      const monthEnd = dayjs()
        .year(year)
        .month(month - 1)
        .endOf("month");

      // 将事件时间限制在当月范围内
      const displayStart = eventStart.isBefore(monthStart)
        ? monthStart
        : eventStart;
      const displayEnd = eventEnd.isAfter(monthEnd) ? monthEnd : eventEnd;

      // 获取显示范围内的日期数字
      const startDay = displayStart.date();
      const endDay = displayEnd.date();

      // 找到开始和结束日期在网格中的索引
      let startIndex = -1;
      let endIndex = -1;

      for (let i = 0; i < dateGrid.length; i++) {
        if (dateGrid[i] === startDay && startIndex === -1) startIndex = i;
        if (dateGrid[i] === endDay) endIndex = i;
      }

      // 如果事件不在当月日历中，不渲染
      if (startIndex === -1 || endIndex === -1) {
        return { spans: [] };
      }

      const spans: EventSpan[] = [];

      // 计算跨越的行
      const startRow = Math.floor(startIndex / 7);
      const endRow = Math.floor(endIndex / 7);

      if (startRow === endRow) {
        // 同一行内的跨天事件
        spans.push({
          eventId: parseInt(event.id) || 0,
          startCol: startIndex % 7,
          endCol: endIndex % 7,
          row: startRow,
          width: (endIndex % 7) - (startIndex % 7) + 1,
          spanType: "single",
        });
      } else {
        // 跨行事件：生成所有行的 spans

        // 第一行：从 startCol 到 6
        spans.push({
          eventId: parseInt(event.id) || 0,
          startCol: startIndex % 7,
          endCol: 6,
          row: startRow,
          width: 7 - (startIndex % 7),
          spanType: "start",
        });

        // 中间行：整行（从 0 到 6）
        for (let row = startRow + 1; row < endRow; row++) {
          spans.push({
            eventId: parseInt(event.id) || 0,
            startCol: 0,
            endCol: 6,
            row,
            width: 7,
            spanType: "middle",
          });
        }

        // 最后一行：从 0 到 endCol
        spans.push({
          eventId: parseInt(event.id) || 0,
          startCol: 0,
          endCol: endIndex % 7,
          row: endRow,
          width: (endIndex % 7) + 1,
          spanType: "end",
        });
      }

      return { spans };
    };

    // 获取应该在顶部布局区域渲染的所有事件信息
    const topLayoutEvents = useMemo(() => {
      if (!events || events.length === 0) return [];

      const result = events
        .map((event) => {
          const renderInfo = getEventRenderInfo(event);
          return {
            event,
            renderInfo,
          };
        })
        .filter(({ renderInfo }) => renderInfo.spans.length > 0);

      return result;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, year, month, dateGrid]);

    // 计算每行的事件布局 - 使用新算法
    const rowEventLayout = useMemo(() => {
      // 动态计算每行可显示的最大事件层级数
      const rowHeight = containerHeight / totalRows;
      const dateAreaHeight = 36; // 日期数字和边距
      const eventHeight = 24; // 事件高度（18px + 6px间距）
      const moreButtonHeight = 18; // "+N 更多" 按钮高度

      // 可用于事件的高度
      const availableHeight = rowHeight - dateAreaHeight - moreButtonHeight;
      const maxEventLevels = Math.max(
        1,
        Math.floor(availableHeight / eventHeight),
      );

      // 转换为算法需要的格式（模拟 CalendarEvent 类型）
      const eventsForAlgorithm = topLayoutEvents.map(
        ({ event, renderInfo }) => ({
          event: {
            id: parseInt(event.id) || 0,
            startDate: event.startDate,
            endDate: event.endDate,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          spans: renderInfo.spans,
        }),
      );

      // 使用新算法分配层级
      const layoutResult = assignMonthViewLevels(
        eventsForAlgorithm,
        maxEventLevels,
        "durationFirst",
      );

      // 转换为需要的格式
      const layout: Map<
        number,
        Array<{ event: CalendarRowEvent; span: EventSpan; level: number }>
      > = new Map();

      // 初始化所有行
      for (let i = 0; i < totalRows; i++) {
        layout.set(i, []);
      }

      // 填充布局结果
      layoutResult.forEach((rowItems, row) => {
        if (!layout.has(row)) {
          layout.set(row, []);
        }
        const rowLayout = layout.get(row);
        if (!rowLayout) return;
        rowItems.forEach((item) => {
          // 找到对应的事件
          const eventInfo = topLayoutEvents.find((e) => {
            const eventId = parseInt(e.event.id) || 0;
            return eventId === item.eventId;
          });
          if (eventInfo) {
            rowLayout.push({
              event: eventInfo.event,
              span: item.span as EventSpan,
              level: item.level,
            });
          }
        });
      });

      return layout;
    }, [topLayoutEvents, containerHeight, totalRows]);

    // 处理日期范围拖拽
    const handleMouseDown = useMemoizedFn(
      (index: number, e: React.MouseEvent) => {
        if (readonly) return;
        e.preventDefault();
        setIsDragging(true);
        setDragStartIndex(index);
        setDragEndIndex(index);
      },
    );

    const handleMouseEnter = useMemoizedFn((index: number) => {
      if (isDragging) {
        setDragEndIndex(index);
      }
    });

    const handleMouseUp = useMemoizedFn(() => {
      if (isDragging && dragStartIndex !== null && dragEndIndex !== null) {
        const validDays = dateGrid.filter((d) => d !== null) as number[];
        const start = Math.min(dragStartIndex, dragEndIndex);
        const end = Math.max(dragStartIndex, dragEndIndex);

        if (start < validDays.length && end < validDays.length) {
          const startDay = validDays[start];
          const endDay = validDays[end];

          const startDate = dayjs()
            .year(year)
            .month(month - 1)
            .date(startDay)
            .startOf("day")
            .valueOf();
          const endDate = dayjs()
            .year(year)
            .month(month - 1)
            .date(endDay)
            .startOf("day")
            .valueOf();

          if (start === end) {
            onDateClick(startDate);
          } else {
            onDateRangeSelect(startDate, endDate);
          }
        }
      }
      setIsDragging(false);
      setDragStartIndex(null);
      setDragEndIndex(null);
    });

    // 监听全局 mouseup
    useEffect(() => {
      if (isDragging) {
        document.addEventListener("mouseup", handleMouseUp);
        return () => {
          document.removeEventListener("mouseup", handleMouseUp);
        };
      }
    }, [isDragging, handleMouseUp]);

    // 处理事件右键菜单
    const handleEventContextMenu = useMemoizedFn(
      (e: React.MouseEvent, event: CalendarRowEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenuEvent(event);
        setContextMenuPosition({ x: e.clientX, y: e.clientY });
      },
    );

    const handleCloseContextMenu = useMemoizedFn(() => {
      setContextMenuEvent(null);
      setContextMenuPosition(null);
    });

    const handleDeleteEvent = useMemoizedFn(() => {
      if (!contextMenuEvent) return;
      onEventDelete(contextMenuEvent.rowData);
      handleCloseContextMenu();
    });

    // 点击其他地方关闭右键菜单
    useEffect(() => {
      if (contextMenuPosition) {
        document.addEventListener("click", handleCloseContextMenu);
        return () => {
          document.removeEventListener("click", handleCloseContextMenu);
        };
      }
    }, [contextMenuPosition, handleCloseContextMenu]);

    // 判断日期是否在拖拽选择范围内
    const isInDragRange = (index: number): boolean => {
      if (!isDragging || dragStartIndex === null || dragEndIndex === null) {
        return false;
      }
      const start = Math.min(dragStartIndex, dragEndIndex);
      const end = Math.max(dragStartIndex, dragEndIndex);
      return index >= start && index <= end;
    };

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
          {weekDays.map((day) => (
            <div
              key={day}
              className="border-r border-gray-200 py-3 text-center text-sm font-medium text-gray-600 last:border-r-0 dark:border-gray-600 dark:text-gray-400"
            >
              {day}
            </div>
          ))}
        </div>

        <div
          ref={containerRef}
          className="relative grid flex-1 grid-cols-7 overflow-hidden"
          style={{
            gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))`,
          }}
        >
          {dateGrid.map((day, index) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${index}`}
                  className="border-b border-r border-gray-200 last:border-r-0 dark:border-gray-700"
                />
              );
            }

            const dayDate = dayjs()
              .year(year)
              .month(month - 1)
              .date(day)
              .startOf("day")
              .valueOf();
            const dayEvents = getEventsForDay(day);
            const isTodayDate = isToday(dayDate);

            // 计算当前单元格所在行需要的事件区域高度
            const currentRow = Math.floor(index / 7);
            const rowSpans = rowEventLayout.get(currentRow) || [];
            const maxLevel =
              rowSpans.length > 0
                ? Math.max(...rowSpans.map((item) => item.level))
                : -1;
            const numLevels = maxLevel + 1;
            const topEventsHeight = numLevels * 24;

            // 统计当天实际渲染在顶部的事件数量（去重）
            const dayCol = index % 7;
            const renderedTopEventIds = new Set(
              rowSpans
                .filter((item) => {
                  const span = item.span;
                  const spanStart = span.startCol;
                  const spanEnd = span.endCol;
                  return dayCol >= spanStart && dayCol <= spanEnd;
                })
                .map((item) => item.event.id),
            );
            const displayedTopCount = renderedTopEventIds.size;

            const totalEvents = dayEvents.length;
            const moreCount = totalEvents - displayedTopCount;

            // 计算实际的日期索引（排除空白格）
            const validDayIndex = dateGrid
              .slice(0, index)
              .filter((d) => d !== null).length;

            const inDragRange = isInDragRange(validDayIndex);

            return (
              <div
                key={day}
                onMouseDown={(e) => handleMouseDown(validDayIndex, e)}
                onMouseEnter={() => handleMouseEnter(validDayIndex)}
                className={`group relative flex flex-col border-b border-r border-gray-200 p-2 last:border-r-0 dark:border-gray-700 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  inDragRange ? "bg-blue-100 dark:bg-blue-900/30" : ""
                }`}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      isTodayDate
                        ? "bg-blue-600 font-bold text-white"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {day}
                  </span>
                </div>

                <div className="flex flex-col flex-1">
                  <div
                    className="flex-1"
                    style={{ marginTop: `${topEventsHeight}px` }}
                  ></div>
                  {moreCount > 0 && (
                    <div
                      className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1 flex-shrink-0"
                      style={{ paddingBottom: "2px", lineHeight: "16px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMoreEventsDay(day);
                        setMoreEventsList(dayEvents);
                      }}
                    >
                      +{moreCount} 更多
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* 事件渲染层 */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from(rowEventLayout.entries()).map(([, rowEvents]) => {
              return rowEvents.map(({ event, span, level }) => {
                const cellWidth = 100 / 7;
                const cellHeight = 100 / totalRows; // 动态计算行高

                const left = span.startCol * cellWidth;
                const width = span.width * cellWidth;
                const rowTop = span.row * cellHeight; // 行顶部位置

                return (
                  <CalendarEvent
                    key={`${event.id}-${span.row}-${span.spanType}`}
                    title={event.title}
                    color={event.color}
                    spanType={span.spanType}
                    left={`calc(${left}% + 4px)`}
                    width={`calc(${width}% - 8px)`}
                    top={`calc(${rowTop}% + 40px + ${level * 24}px)`}
                    onClick={() => {
                      onEventClick(event.rowData);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onContextMenu={(e) => handleEventContextMenu(e, event)}
                  />
                );
              });
            })}
          </div>
        </div>

        {/* "+N 更多" 弹窗 */}
        {moreEventsDay !== null && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50"
            onClick={() => {
              setMoreEventsDay(null);
              setMoreEventsList([]);
            }}
          >
            <div
              className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {year}年{month}月{moreEventsDay}日的事件
                </h3>
                <button
                  onClick={() => {
                    setMoreEventsDay(null);
                    setMoreEventsList([]);
                  }}
                  className="rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <MdClose className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {moreEventsList.map((event) => (
                  <div
                    key={event.id}
                    onClick={() => {
                      onEventClick(event.rowData);
                      setMoreEventsDay(null);
                      setMoreEventsList([]);
                    }}
                    className="cursor-pointer rounded-lg px-3 py-2 text-white hover:opacity-90"
                    style={{ backgroundColor: event.color }}
                  >
                    <div className="font-medium">{event.title}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 右键菜单 */}
        {contextMenuPosition && contextMenuEvent && (
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[120px]"
            style={{
              left: `${contextMenuPosition.x}px`,
              top: `${contextMenuPosition.y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleDeleteEvent}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400"
            >
              删除事件
            </button>
          </div>
        )}
      </div>
    );
  },
);

MonthGrid.displayName = "MonthGrid";

export default MonthGrid;
