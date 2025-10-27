import { useMemo, useState, useEffect, useRef } from "react";
import useCalendarStore from "@/stores/useCalendarStore";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { useTimeSlotDrag } from "@/hooks/useTimeSlotDrag";
import { useEventOverlap } from "@/hooks/useEventOverlap";
import {
  getWeekStart,
  formatTime,
  isToday,
  getDateStart,
} from "@/utils/calendar";
import { getProjectColorValue } from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";
import dayjs from "dayjs";
import { assignWeekViewLevels } from "@/utils/eventLayoutAlgorithm";
import { hexToRgba } from "../../utils";

const CELL_HEIGHT = 30;
const GRID_START_TIME = 0;

interface PendingWeekEvent {
  dayIndex: number;
  dayDate: Date;
  startMinutes: number;
  endMinutes: number;
}

const WeekView = () => {
  const { currentDate, calendars, setEditingEvent, editingEvent } =
    useCalendarStore();
  const { events } = useCalendarEvents();
  const { setting } = useSettingStore();
  const theme = setting.darkMode ? "dark" : "light";

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [pendingEvent, setPendingEvent] = useState<PendingWeekEvent | null>(
    null,
  );
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // 当编辑对话框关闭时，清除待创建事件高亮
  useEffect(() => {
    if (!editingEvent) {
      setPendingEvent(null);
    }
  }, [editingEvent]);

  // 更新当前时间
  useEffect(() => {
    const updateCurrentTime = () => {
      const now = new Date();
      setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
    };

    // 每分钟更新一次
    const timer = setInterval(updateCurrentTime, 60000);
    return () => clearInterval(timer);
  }, []);

  // 自动滚动到当前时间
  useEffect(() => {
    if (scrollContainerRef.current) {
      // 计算当前时间对应的位置
      const scrollPosition = (currentTimeMinutes / 15) * CELL_HEIGHT;
      // 减去一些偏移量，让当前时间显示在视口中间靠上的位置
      const offset = scrollContainerRef.current.clientHeight / 3;
      scrollContainerRef.current.scrollTop = Math.max(
        0,
        scrollPosition - offset,
      );
    }
  }, [currentDate]); // 当日期变化时触发滚动

  const weekStart = getWeekStart(currentDate);

  // 生成一周的日期
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  }, [weekStart]);

  // 为每一天创建拖拽处理器 - 直接打开侧边弹窗
  const createDayDragHandler = (dayDate: Date, dayIndex: number) => {
    return (startMinutes: number, endMinutes: number) => {
      if (calendars.length === 0) {
        alert("请先创建一个日历");
        return;
      }

      // 设置待创建事件（用于高亮显示）
      setPendingEvent({
        dayIndex,
        dayDate,
        startMinutes,
        endMinutes,
      });

      // 优先选择第一个非系统日历
      const nonSystemCalendars = calendars.filter((c) => !c.isInSystemGroup);
      const defaultCalendarId =
        nonSystemCalendars.length > 0
          ? nonSystemCalendars[0].id
          : calendars[0].id;

      // 同时打开编辑对话框
      const dayStart = getDateStart(dayDate.getTime());
      const newEvent: any = {
        id: 0,
        createTime: Date.now(),
        updateTime: Date.now(),
        calendarId: defaultCalendarId,
        title: "",
        detailContentId: 0,
        startDate: dayStart,
        endDate: dayStart,
        startTime: startMinutes,
        endTime: endMinutes,
        color: null,
        allDay: false,
      };
      setEditingEvent(newEvent);
    };
  };

  // 为每一天创建独立的拖拽 hook
  const dayDragHooks = weekDays.map((day, index) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTimeSlotDrag({
      onSelect: createDayDragHandler(day, index),
      cellHeight: CELL_HEIGHT,
      gridStartTime: GRID_START_TIME,
    }),
  );

  // 为每一天的有时间事件计算重叠位置
  const dayTimedEventsLists = useMemo(() => {
    if (!events) return weekDays.map(() => []);
    return weekDays.map((day) => {
      const dayDate = getDateStart(day.getTime());
      return events.filter((event) => {
        if (event.allDay) return false;
        const eventDate = getDateStart(event.startDate);
        return eventDate === dayDate;
      });
    });
  }, [weekDays, events]);

  // 为每一天分别计算重叠位置（使用 hook）
  const day0Positions = useEventOverlap(dayTimedEventsLists[0] || []);
  const day1Positions = useEventOverlap(dayTimedEventsLists[1] || []);
  const day2Positions = useEventOverlap(dayTimedEventsLists[2] || []);
  const day3Positions = useEventOverlap(dayTimedEventsLists[3] || []);
  const day4Positions = useEventOverlap(dayTimedEventsLists[4] || []);
  const day5Positions = useEventOverlap(dayTimedEventsLists[5] || []);
  const day6Positions = useEventOverlap(dayTimedEventsLists[6] || []);

  const dayEventPositions = [
    day0Positions,
    day1Positions,
    day2Positions,
    day3Positions,
    day4Positions,
    day5Positions,
    day6Positions,
  ];

  // 生成时间标签
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
      slots.push(hour * 60);
    }
    return slots;
  }, []);

  const weekDayNames = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <div className="w-16 flex-shrink-0" />
        {weekDays.map((day, index) => {
          const isTodayDate = isToday(day.getTime());
          return (
            <div
              key={index}
              className="flex flex-1 flex-col items-center border-l border-gray-200 py-3 dark:border-gray-700"
            >
              <div className="text-xs text-gray-500 dark:text-gray-400">
                周{weekDayNames[index]}
              </div>
              <div
                className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  isTodayDate
                    ? "bg-blue-600 font-bold text-white"
                    : "text-gray-900 dark:text-gray-100"
                }`}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          <div className="w-16 flex-shrink-0 p-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">全天</div>
          </div>
          <div
            className="flex-1 relative p-2"
            style={{
              minHeight: (() => {
                // 统一收集所有全天事件
                const allDayEvents = events
                  ? events.filter((event) => event.allDay)
                  : [];
                // 使用算法分配层级
                const eventLevels = assignWeekViewLevels(
                  allDayEvents,
                  weekDays[0],
                );
                const maxLevel = Math.max(
                  0,
                  ...Array.from(eventLevels.values()),
                );

                return `${Math.max(40, 8 + (maxLevel + 1) * 20)}px`;
              })(),
            }}
          >
            {(() => {
              // 统一处理所有全天事件的 level 分配
              const allDayEvents = events
                ? events.filter((event) => event.allDay)
                : [];

              // 使用新算法分配层级
              const eventLevels = assignWeekViewLevels(
                allDayEvents,
                weekDays[0],
              );

              return (
                <>
                  {/* 渲染跨天全天事件 */}
                  {allDayEvents
                    .filter(
                      (event) =>
                        event.endDate &&
                        !dayjs(event.startDate).isSame(
                          dayjs(event.endDate),
                          "day",
                        ),
                    )
                    .map((event) => {
                      const eventLevel = eventLevels.get(event.id) || 0;
                      const startDate = dayjs(event.startDate);
                      const endDate = dayjs(event.endDate);
                      const weekStart = dayjs(weekDays[0]);

                      // 计算事件在周视图中的位置
                      const startDayIndex = Math.max(
                        0,
                        startDate.diff(weekStart, "day"),
                      );
                      const endDayIndex = Math.min(
                        6,
                        endDate.diff(weekStart, "day"),
                      );

                      if (startDayIndex > 6 || endDayIndex < 0) return null;

                      const width =
                        ((endDayIndex - startDayIndex + 1) / 7) * 100;
                      const left = (startDayIndex / 7) * 100;

                      const calendar = calendars.find(
                        (c) => c.id === event.calendarId,
                      );
                      const color = event.color || calendar?.color || "blue";
                      const colorValue = hexToRgba(
                        getProjectColorValue(
                          color,
                          theme === "dark" ? "dark" : "light",
                        ),
                        0.9,
                      );

                      return (
                        <div
                          key={event.id}
                          onClick={() => setEditingEvent(event)}
                          className="absolute cursor-pointer rounded p-2 h-4 flex items-center text-xs text-white shadow-sm"
                          style={{
                            backgroundColor: colorValue,
                            left: `${left}%`,
                            width: `${width}%`,
                            top: `${4 + eventLevel * 20}px`,
                          }}
                          title={event.title}
                        >
                          <div className="truncate font-medium">
                            {event.title}
                          </div>
                        </div>
                      );
                    })}

                  {/* 渲染单天全天事件 */}
                  {weekDays.map((day, dayIndex) => {
                    const dayStart = getDateStart(day.getTime());
                    const dayEvents = allDayEvents.filter(
                      (event) =>
                        (!event.endDate ||
                          dayjs(event.startDate).isSame(
                            dayjs(event.endDate || event.startDate),
                            "day",
                          )) &&
                        getDateStart(event.startDate) === dayStart,
                    );

                    return (
                      <div key={dayIndex}>
                        {dayEvents.map((event) => {
                          const eventLevel = eventLevels.get(event.id) || 0;
                          const calendar = calendars.find(
                            (c) => c.id === event.calendarId,
                          );
                          const color =
                            event.color || calendar?.color || "blue";
                          const colorValue = hexToRgba(
                            getProjectColorValue(
                              color,
                              theme === "dark" ? "dark" : "light",
                            ),
                            0.9,
                          );

                          return (
                            <div
                              key={event.id}
                              onClick={() => setEditingEvent(event)}
                              className="absolute cursor-pointer rounded px-2 text-xs text-white shadow-sm"
                              style={{
                                backgroundColor: colorValue,
                                left: `${(dayIndex / 7) * 100}%`,
                                width: `${(1 / 7) * 100}%`,
                                top: `${4 + eventLevel * 20}px`,
                                height: "16px",
                              }}
                              title={event.title}
                            >
                              <div className="truncate">{event.title}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* 时间网格 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="relative flex min-h-full pt-3">
          {/* 时间标签 */}
          <div className="sticky left-0 z-10 w-16 flex-shrink-0">
            {timeSlots.map((minutes) => (
              <div
                key={minutes}
                className="border-b border-gray-200 text-right text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
                style={{ height: `${CELL_HEIGHT * 4}px` }}
              >
                <span className="relative -top-2 pr-2">
                  {formatTime(minutes)}
                </span>
              </div>
            ))}
          </div>

          {/* 当前时间红线 - 横跨整周，红点在今天位置 */}
          {(() => {
            const todayIndex = weekDays.findIndex((day) =>
              isToday(day.getTime()),
            );
            if (todayIndex === -1) return null;

            return (
              <div
                className="absolute pointer-events-none z-30"
                style={{
                  top: `${12 + (currentTimeMinutes / 15) * CELL_HEIGHT}px`,
                  left: "64px", // w-16 = 64px
                  right: 0,
                }}
              >
                <div className="relative h-0.5 bg-red-500">
                  <div
                    className="absolute h-2 w-2 rounded-full bg-red-500"
                    style={{
                      left: `${(todayIndex / 7) * 100}%`,
                      top: "-3px",
                    }}
                  />
                </div>
              </div>
            );
          })()}

          {/* 每一天的列 */}
          {weekDays.map((_day, dayIndex) => {
            const dragHook = dayDragHooks[dayIndex];
            const { isDragging, selectedRange, handlers } = dragHook;

            return (
              <div
                key={dayIndex}
                className="relative flex-1 border-l border-gray-200 dark:border-gray-700"
                {...handlers}
              >
                {/* 网格线 */}
                {timeSlots.map((minutes) => (
                  <div
                    key={minutes}
                    className="border-b border-gray-200 dark:border-gray-700"
                    style={{ height: `${CELL_HEIGHT * 4}px` }}
                  />
                ))}

                {/* 拖拽选中的时间范围 */}
                {isDragging && selectedRange && (
                  <div
                    className="absolute left-0 right-0 bg-blue-500/30 pointer-events-none"
                    style={{
                      top: `${(selectedRange.start / 15) * CELL_HEIGHT}px`,
                      height: `${((selectedRange.end - selectedRange.start) / 15) * CELL_HEIGHT}px`,
                    }}
                  />
                )}

                {/* 待创建事件区域 - 仅高亮显示 */}
                {pendingEvent &&
                  pendingEvent.dayIndex === dayIndex &&
                  !isDragging && (
                    <div
                      className="absolute left-0 right-0 pointer-events-none rounded-lg border-2 border-blue-500 bg-blue-100/50 dark:bg-blue-900/30"
                      style={{
                        top: `${(pendingEvent.startMinutes / 15) * CELL_HEIGHT}px`,
                        height: `${((pendingEvent.endMinutes - pendingEvent.startMinutes) / 15) * CELL_HEIGHT - 4}px`,
                      }}
                    />
                  )}

                {/* 渲染当天有时间的事件 */}
                {dayTimedEventsLists[dayIndex].map((event) => {
                  const position = dayEventPositions[dayIndex].get(event.id);
                  const calendar = calendars.find(
                    (c) => c.id === event.calendarId,
                  );
                  const color = event.color || calendar?.color || "blue";
                  const colorValue = hexToRgba(
                    getProjectColorValue(
                      color,
                      theme === "dark" ? "dark" : "light",
                    ),
                    0.9,
                  );

                  const startMinutes = event.startTime || 0;
                  const endMinutes = event.endTime || startMinutes + 60;
                  const duration = endMinutes - startMinutes;

                  return (
                    <div
                      key={event.id}
                      onClick={() => setEditingEvent(event)}
                      className="absolute cursor-pointer rounded p-2 text-xs text-white shadow-sm"
                      style={{
                        backgroundColor: colorValue,
                        top: `${(startMinutes / 15) * CELL_HEIGHT}px`,
                        height: `${Math.max((duration / 15) * CELL_HEIGHT - 2, CELL_HEIGHT)}px`,
                        left: position ? `${position.left}%` : "0%",
                        width: position ? `${position.width}%` : "100%",
                        zIndex: position ? position.zIndex + 19 : 20,
                      }}
                      title={event.title}
                    >
                      <div className="truncate font-medium">{event.title}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WeekView;
