import { useMemo, useState, useEffect, useRef } from "react";
import useCalendarStore from "@/stores/useCalendarStore";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useDateRangeDrag } from "@/hooks/useDateRangeDrag";
import {
  getDaysInMonth,
  getFirstDayOfMonth,
  isToday,
  getDateStart,
} from "@/utils/calendar";
import { getProjectColorValue } from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";
import { CalendarEvent } from "@/types";
import { MdClose } from "react-icons/md";
import dayjs from "dayjs";
import { assignMonthViewLevels } from "@/utils/eventLayoutAlgorithm";

interface PendingDateEvent {
  startDate: number;
  endDate: number;
}

interface EventSpan {
  eventId: number;
  startCol: number;
  endCol: number;
  row: number;
  width: number;
  spanType: "single" | "start" | "middle" | "end";
}

const MonthView = () => {
  const { currentDate, calendars, setEditingEvent, editingEvent } =
    useCalendarStore();
  const { events } = useCalendarEvents();
  const { setting } = useSettingStore();
  const theme = setting.darkMode ? "dark" : "light";

  const [moreEventsDay, setMoreEventsDay] = useState<number | null>(null);
  const [moreEventsList, setMoreEventsList] = useState<CalendarEvent[]>([]);
  const [pendingEvent, setPendingEvent] = useState<PendingDateEvent | null>(
    null,
  );

  // 容器引用和尺寸监听
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  // 当编辑对话框关闭时，清除待创建事件高亮
  useEffect(() => {
    if (!editingEvent) {
      setPendingEvent(null);
    }
  }, [editingEvent]);

  // 创建事件 - 直接打开侧边弹窗
  const handleCreateEvent = (startDate: number, endDate?: number) => {
    if (calendars.length === 0) {
      alert("请先创建一个日历");
      return;
    }

    const finalEndDate = endDate || startDate;

    // 设置待创建事件（用于高亮显示）
    setPendingEvent({
      startDate,
      endDate: finalEndDate,
    });

    // 优先选择第一个非系统日历
    const nonSystemCalendars = calendars.filter((c) => !c.isInSystemGroup);
    const defaultCalendarId =
      nonSystemCalendars.length > 0
        ? nonSystemCalendars[0].id
        : calendars[0].id;

    // 同时打开编辑对话框
    const newEvent: any = {
      id: 0,
      createTime: Date.now(),
      updateTime: Date.now(),
      calendarId: defaultCalendarId,
      title: "",
      detailContentId: 0,
      startDate: startDate,
      endDate: startDate === finalEndDate ? null : finalEndDate,
      startTime: null,
      endTime: null,
      color: null,
      allDay: true,
    };
    setEditingEvent(newEvent);
  };

  // 日期范围拖拽创建事件
  const handleDateRangeSelect = (startIndex: number, endIndex: number) => {
    if (calendars.length === 0) {
      alert("请先创建一个日历");
      return;
    }

    // 从 dateGrid 中获取对应的日期
    const validDays = dateGrid.filter((d) => d !== null) as number[];
    if (startIndex >= validDays.length || endIndex >= validDays.length) return;

    const startDay = validDays[startIndex];
    const endDay = validDays[endIndex];

    // 使用 dayjs 处理日期，避免时区问题
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

    handleCreateEvent(startDate, endDate);
  };

  const {
    isDragging,
    selectedRange,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
  } = useDateRangeDrag({ onSelect: handleDateRangeSelect });

  // 监听全局 mouseup 事件
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseUp]);

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

  const date = new Date(currentDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

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

  // 获取某一天的事件
  const getEventsForDay = (day: number): CalendarEvent[] => {
    if (!events) return [];
    const dayDate = dayjs()
      .year(year)
      .month(month - 1)
      .date(day)
      .startOf("day")
      .valueOf();
    return events.filter((event) => {
      const eventStart = getDateStart(event.startDate);
      const eventEnd = event.endDate ? getDateStart(event.endDate) : eventStart;
      return dayDate >= eventStart && dayDate <= eventEnd;
    });
  };

  // 计算全天事件的渲染信息（包括单日和跨天）
  const getEventRenderInfo = (event: CalendarEvent) => {
    const eventStart = dayjs(event.startDate);
    const eventEnd = event.endDate ? dayjs(event.endDate) : eventStart;

    // 在月视图中，所有全天事件都应该参与统一的布局算法，包括单日事件
    // 这样才能避免重叠

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
        eventId: event.id,
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
        eventId: event.id,
        startCol: startIndex % 7,
        endCol: 6,
        row: startRow,
        width: 7 - (startIndex % 7),
        spanType: "start",
      });

      // 中间行：整行（从 0 到 6）
      for (let row = startRow + 1; row < endRow; row++) {
        spans.push({
          eventId: event.id,
          startCol: 0,
          endCol: 6,
          row,
          width: 7,
          spanType: "middle",
        });
      }

      // 最后一行：从 0 到 endCol
      spans.push({
        eventId: event.id,
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
  // 在月视图中，为了保持布局一致性，所有事件都参与统一的顶部布局
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
      .filter(({ renderInfo }) => renderInfo.spans.length > 0); // 有 spans 的才参与布局

    return result;
  }, [events, year, month, dateGrid]);

  // 计算实际的行数
  const totalRows = useMemo(() => Math.ceil(dateGrid.length / 7), [dateGrid]);

  // 计算每行的事件布局 - 使用新算法
  const rowEventLayout = useMemo(() => {
    // 动态计算每行可显示的最大事件层级数
    const rowHeight = containerHeight / totalRows;
    const dateAreaHeight = 36; // 日期数字和边距
    const eventHeight = 24; // 事件高度（18px + 6px间距）
    const moreButtonHeight = 18; // "+N 更多" 按钮高度（16px line-height + 2px padding）

    // 可用于事件的高度（预留 "+N 更多" 按钮的空间）
    const availableHeight = rowHeight - dateAreaHeight - moreButtonHeight;
    const maxEventLevels = Math.max(
      1,
      Math.floor(availableHeight / eventHeight),
    );

    // 转换为算法需要的格式
    const eventsForAlgorithm = topLayoutEvents.map(({ event, renderInfo }) => ({
      event,
      spans: renderInfo.spans,
    }));

    // 使用新算法分配层级（传入策略参数）
    const layoutResult = assignMonthViewLevels(
      eventsForAlgorithm,
      maxEventLevels,
      "durationFirst",
    );

    // 转换为需要的格式
    const layout: Map<
      number,
      Array<{ event: CalendarEvent; span: EventSpan; level: number }>
    > = new Map();

    // 初始化所有行
    for (let i = 0; i < totalRows; i++) {
      layout.set(i, []);
    }

    // 填充布局结果
    layoutResult.forEach((rowItems, row) => {
      // 确保 row 存在（防止算法返回超出范围的行）
      if (!layout.has(row)) {
        layout.set(row, []);
      }
      const rowLayout = layout.get(row)!;
      rowItems.forEach((item) => {
        // 找到对应的事件
        const eventInfo = topLayoutEvents.find(
          (e) => e.event.id === item.eventId,
        );
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

  const weekDays = ["一", "二", "三", "四", "五", "六", "日"];

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
          // 计算该行的最大层级（同一层级的事件并排显示，不占用额外高度）
          const maxLevel =
            rowSpans.length > 0
              ? Math.max(...rowSpans.map((item) => item.level))
              : -1;
          const numLevels = maxLevel + 1;
          // 每层 24px（18px 高度 + 6px 间距）
          const topEventsHeight = numLevels * 24;

          // 统计当天实际渲染在顶部的事件数量（去重）
          const dayCol = index % 7; // 当前日期在网格中的列位置
          const renderedTopEventIds = new Set(
            rowSpans
              .filter((item) => {
                const span = item.span;
                // 检查这个 span 是否包含当前列
                const spanStart = span.startCol;
                const spanEnd = span.endCol;
                return dayCol >= spanStart && dayCol <= spanEnd;
              })
              .map((item) => item.event.id),
          );
          const displayedTopCount = renderedTopEventIds.size;

          // 计算实际的日期索引（排除空白格）
          const validDayIndex = dateGrid
            .slice(0, index)
            .filter((d) => d !== null).length;

          return (
            <div
              key={day}
              onClick={() => {
                if (!isDragging && !pendingEvent) {
                  handleCreateEvent(dayDate);
                }
              }}
              onMouseDown={handleMouseDown(validDayIndex)}
              onMouseEnter={() => handleMouseEnter(validDayIndex)}
              className="group relative flex flex-col border-b border-r border-gray-200 p-2 last:border-r-0 dark:border-gray-700 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800"
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
                {/* 在月视图中，所有事件都在顶部统一布局，单元格内部不再单独显示事件 */}
                <div
                  className="flex-1"
                  style={{ marginTop: `${topEventsHeight}px` }}
                ></div>
                {(() => {
                  // 计算实际显示的事件数量
                  // 月视图中所有事件都在顶部统一显示
                  const totalEvents = dayEvents.length;

                  // 已显示事件数（在顶部渲染的事件数）
                  const displayedEvents = displayedTopCount;

                  // 未显示事件数
                  const moreCount = totalEvents - displayedEvents;

                  if (moreCount > 0) {
                    return (
                      <div
                        className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1 flex-shrink-0"
                        style={{ paddingBottom: "2px", lineHeight: "16px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoreEventsDay(day);
                          setMoreEventsList(dayEvents);
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        +{moreCount} 更多
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          );
        })}

        {/* 事件渲染层（所有事件统一在顶部布局） */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* 渲染实际事件 */}
          {Array.from(rowEventLayout.entries()).map(([_row, rowEvents]) => {
            return rowEvents.map(({ event, span, level }) => {
              const calendar = calendars.find((c) => c.id === event.calendarId);
              const color = event.color || calendar?.color || "blue";
              const colorValue = getProjectColorValue(
                color,
                theme === "dark" ? "dark" : "light",
              );

              // 计算位置 - 基于网格系统
              const cellWidth = 100 / 7;
              const cellHeight = 100 / 5; // 每行高度

              const left = span.startCol * cellWidth;
              const width = span.width * cellWidth;
              const rowTop = span.row * cellHeight; // 行顶部位置

              // 根据 spanType 调整圆角样式
              let borderRadius = "4px";
              if (span.spanType === "start") {
                borderRadius = "4px 0 0 4px";
              } else if (span.spanType === "end") {
                borderRadius = "0 4px 4px 0";
              } else if (span.spanType === "middle") {
                borderRadius = "0";
              }

              return (
                <div
                  key={`${event.id}-${span.row}-${span.spanType}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingEvent(event);
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  className="absolute cursor-pointer text-xs text-white shadow-sm pointer-events-auto flex items-center hover:opacity-90 transition-opacity"
                  style={{
                    backgroundColor: colorValue,
                    left: `calc(${left}% + 4px)`,
                    width: `calc(${width}% - 8px)`,
                    top: `calc(${rowTop}% + 40px + ${level * 24}px)`,
                    height: "18px",
                    zIndex: 10 + level,
                    paddingLeft: "6px",
                    paddingRight: "6px",
                    fontSize: "11px",
                    borderRadius,
                  }}
                  title={event.title}
                >
                  <div className="truncate font-medium">{event.title}</div>
                </div>
              );
            });
          })}

          {/* 渲染拖拽预览条 */}
          {isDragging &&
            selectedRange &&
            (() => {
              // 计算拖拽范围的 spans
              const validDays = dateGrid.filter((d) => d !== null) as number[];
              const startIndex = selectedRange.start;
              const endIndex = selectedRange.end;

              if (
                startIndex >= validDays.length ||
                endIndex >= validDays.length
              )
                return null;

              // 找到开始和结束日期在网格中的实际索引
              let realStartIndex = -1;
              let realEndIndex = -1;
              let validCount = -1;

              for (let i = 0; i < dateGrid.length; i++) {
                if (dateGrid[i] !== null) {
                  validCount++;
                  if (validCount === startIndex) realStartIndex = i;
                  if (validCount === endIndex) realEndIndex = i;
                }
              }

              if (realStartIndex === -1 || realEndIndex === -1) return null;

              // 计算跨越的行
              const startRow = Math.floor(realStartIndex / 7);
              const endRow = Math.floor(realEndIndex / 7);

              const cellWidth = 100 / 7;
              const cellHeight = 100 / 5;
              const level = 0; // 始终在第一排

              const spans = [];

              if (startRow === endRow) {
                // 同一行
                spans.push({
                  startCol: realStartIndex % 7,
                  endCol: realEndIndex % 7,
                  row: startRow,
                  width: (realEndIndex % 7) - (realStartIndex % 7) + 1,
                  spanType: "single" as const,
                });
              } else {
                // 跨行
                // 第一行
                spans.push({
                  startCol: realStartIndex % 7,
                  endCol: 6,
                  row: startRow,
                  width: 7 - (realStartIndex % 7),
                  spanType: "start" as const,
                });

                // 中间行
                for (let row = startRow + 1; row < endRow; row++) {
                  spans.push({
                    startCol: 0,
                    endCol: 6,
                    row,
                    width: 7,
                    spanType: "middle" as const,
                  });
                }

                // 最后一行
                spans.push({
                  startCol: 0,
                  endCol: realEndIndex % 7,
                  row: endRow,
                  width: (realEndIndex % 7) + 1,
                  spanType: "end" as const,
                });
              }

              return spans.map((span, idx) => {
                const left = span.startCol * cellWidth;
                const width = span.width * cellWidth;
                const rowTop = span.row * cellHeight;

                let borderRadius = "4px";
                if (span.spanType === "start") {
                  borderRadius = "4px 0 0 4px";
                } else if (span.spanType === "end") {
                  borderRadius = "0 4px 4px 0";
                } else if (span.spanType === "middle") {
                  borderRadius = "0";
                }

                return (
                  <div
                    key={`drag-preview-${idx}`}
                    className="absolute pointer-events-none flex items-center"
                    style={{
                      backgroundColor: "rgba(59, 130, 246, 0.5)", // 蓝色半透明
                      left: `calc(${left}% + 4px)`,
                      width: `calc(${width}% - 8px)`,
                      top: `calc(${rowTop}% + 40px + ${level * 24}px)`,
                      height: "18px",
                      zIndex: 49,
                      paddingLeft: "6px",
                      paddingRight: "6px",
                      fontSize: "11px",
                      borderRadius,
                    }}
                  />
                );
              });
            })()}

          {/* 渲染待创建事件预览条（弹窗打开时） */}
          {pendingEvent &&
            (() => {
              const startDate = Math.min(
                pendingEvent.startDate,
                pendingEvent.endDate,
              );
              const endDate = Math.max(
                pendingEvent.startDate,
                pendingEvent.endDate,
              );

              // 找到开始和结束日期在网格中的索引
              let realStartIndex = -1;
              let realEndIndex = -1;

              for (let i = 0; i < dateGrid.length; i++) {
                if (dateGrid[i] !== null) {
                  const cellDate = dayjs()
                    .year(year)
                    .month(month - 1)
                    .date(dateGrid[i]!)
                    .startOf("day")
                    .valueOf();
                  if (cellDate === startDate) realStartIndex = i;
                  if (cellDate === endDate) realEndIndex = i;
                }
              }

              if (realStartIndex === -1 || realEndIndex === -1) return null;

              // 计算跨越的行
              const startRow = Math.floor(realStartIndex / 7);
              const endRow = Math.floor(realEndIndex / 7);

              const cellWidth = 100 / 7;
              const cellHeight = 100 / 5;
              const level = 0; // 始终在第一排

              const spans = [];

              if (startRow === endRow) {
                // 同一行
                spans.push({
                  startCol: realStartIndex % 7,
                  endCol: realEndIndex % 7,
                  row: startRow,
                  width: (realEndIndex % 7) - (realStartIndex % 7) + 1,
                  spanType: "single" as const,
                });
              } else {
                // 跨行
                spans.push({
                  startCol: realStartIndex % 7,
                  endCol: 6,
                  row: startRow,
                  width: 7 - (realStartIndex % 7),
                  spanType: "start" as const,
                });

                for (let row = startRow + 1; row < endRow; row++) {
                  spans.push({
                    startCol: 0,
                    endCol: 6,
                    row,
                    width: 7,
                    spanType: "middle" as const,
                  });
                }

                spans.push({
                  startCol: 0,
                  endCol: realEndIndex % 7,
                  row: endRow,
                  width: (realEndIndex % 7) + 1,
                  spanType: "end" as const,
                });
              }

              return spans.map((span, idx) => {
                const left = span.startCol * cellWidth;
                const width = span.width * cellWidth;
                const rowTop = span.row * cellHeight;

                let borderRadius = "4px";
                if (span.spanType === "start") {
                  borderRadius = "4px 0 0 4px";
                } else if (span.spanType === "end") {
                  borderRadius = "0 4px 4px 0";
                } else if (span.spanType === "middle") {
                  borderRadius = "0";
                }

                return (
                  <div
                    key={`pending-preview-${idx}`}
                    className="absolute pointer-events-none flex items-center bg-blue-500/80"
                    style={{
                      left: `calc(${left}% + 4px)`,
                      width: `calc(${width}% - 8px)`,
                      top: `calc(${rowTop}% + 40px + ${level * 24}px)`,
                      height: "18px",
                      zIndex: 49,
                      paddingLeft: "6px",
                      paddingRight: "6px",
                      fontSize: "11px",
                      borderRadius,
                    }}
                  />
                );
              });
            })()}
        </div>
      </div>

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
            {/* 头部 */}
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

            {/* 事件列表 */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {moreEventsList.map((event) => {
                const calendar = calendars.find(
                  (c) => c.id === event.calendarId,
                );
                const color = event.color || calendar?.color || "blue";
                const colorValue = getProjectColorValue(
                  color,
                  theme === "dark" ? "dark" : "light",
                );

                return (
                  <div
                    key={event.id}
                    onClick={() => {
                      setEditingEvent(event);
                      setMoreEventsDay(null);
                      setMoreEventsList([]);
                    }}
                    className="cursor-pointer rounded-lg px-3 py-2 text-white hover:opacity-90"
                    style={{ backgroundColor: colorValue }}
                  >
                    <div className="font-medium">{event.title}</div>
                    {!event.allDay &&
                      event.startTime !== null &&
                      event.endTime !== null && (
                        <div className="text-sm opacity-90">
                          {Math.floor(event.startTime / 60)}:
                          {(event.startTime % 60).toString().padStart(2, "0")} -{" "}
                          {Math.floor(event.endTime / 60)}:
                          {(event.endTime % 60).toString().padStart(2, "0")}
                        </div>
                      )}
                    {event.allDay && (
                      <div className="text-sm opacity-90">全天</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthView;
