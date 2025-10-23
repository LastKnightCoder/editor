import { useMemo, useState, useEffect } from "react";
import useCalendarStore from "@/stores/useCalendarStore";
import {
  useCalendarEvents,
  useAllDayEvents,
  useTimedEvents,
} from "@/hooks/useCalendarEvents";
import { useEventOverlap } from "@/hooks/useEventOverlap";
import { useTimeSlotDrag } from "@/hooks/useTimeSlotDrag";
import {
  formatTime,
  getEventGridPosition,
  getDateStart,
} from "@/utils/calendar";
import { getProjectColorValue } from "@/constants/project-colors";
import useSettingStore from "@/stores/useSettingStore";
import { CalendarEvent } from "@/types";

const CELL_HEIGHT = 30; // 每个时间槽（15分钟）的高度
const GRID_START_TIME = 0; // 00:00
const GRID_END_TIME = 1440; // 24:00

interface PendingTimeEvent {
  startMinutes: number;
  endMinutes: number;
}

const DayView = () => {
  const { currentDate, calendars, setEditingEvent, editingEvent } =
    useCalendarStore();
  const { events } = useCalendarEvents();
  const { setting } = useSettingStore();
  const theme = setting.darkMode ? "dark" : "light";

  const [pendingEvent, setPendingEvent] = useState<PendingTimeEvent | null>(
    null,
  );

  // 当编辑对话框关闭时，清除待创建事件高亮
  useEffect(() => {
    if (!editingEvent) {
      setPendingEvent(null);
    }
  }, [editingEvent]);

  // 过滤当天的事件
  const dayStart = getDateStart(currentDate);
  const dayEvents = useMemo(() => {
    return events.filter((event) => {
      const eventStart = getDateStart(event.startDate);
      const eventEnd = event.endDate ? getDateStart(event.endDate) : eventStart;
      return dayStart >= eventStart && dayStart <= eventEnd;
    });
  }, [events, dayStart]);

  const allDayEvents = useAllDayEvents(dayEvents);
  const timedEvents = useTimedEvents(dayEvents);
  const eventPositions = useEventOverlap(timedEvents);

  // 拖拽创建事件 - 直接打开侧边弹窗
  const handleTimeSlotSelect = (startMinutes: number, endMinutes: number) => {
    if (calendars.length === 0) {
      alert("请先创建一个日历");
      return;
    }

    // 设置待创建事件（用于高亮显示）
    setPendingEvent({ startMinutes, endMinutes });

    // 同时打开编辑对话框
    const newEvent: CalendarEvent = {
      id: 0,
      createTime: Date.now(),
      updateTime: Date.now(),
      calendarId: calendars[0].id,
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

  const { isDragging, selectedRange, handlers } = useTimeSlotDrag({
    onSelect: handleTimeSlotSelect,
    cellHeight: CELL_HEIGHT,
    gridStartTime: GRID_START_TIME,
  });

  // 生成时间标签（每小时）
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
      slots.push(hour * 60);
    }
    return slots;
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 全天事件区域 */}
      {allDayEvents.length > 0 && (
        <div className="border-b border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            全天
          </div>
          <div className="mt-1 space-y-1">
            {allDayEvents.map((event) => {
              const calendar = calendars.find((c) => c.id === event.calendarId);
              const color = event.color || calendar?.color || "blue";
              const colorValue = getProjectColorValue(
                color,
                theme === "dark" ? "dark" : "light",
              );

              return (
                <div
                  key={event.id}
                  onClick={() => setEditingEvent(event)}
                  className="cursor-pointer rounded px-2 h-4 flex items-center text-xs text-white"
                  style={{ backgroundColor: colorValue }}
                >
                  {event.title}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 时间网格 */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative min-h-full">
          <div className="h-3" />

          <div className="sticky left-0 top-0 z-10 w-16">
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

          {/* 时间网格线 */}
          <div className="absolute left-16 right-0 top-3" {...handlers}>
            {timeSlots.map((minutes) => (
              <div
                key={minutes}
                className="border-b border-gray-200 dark:border-gray-700"
                style={{ height: `${CELL_HEIGHT * 4}px` }}
              />
            ))}

            {/* 拖拽选择区域 */}
            {isDragging && selectedRange && (
              <div
                className="absolute left-0 right-0 bg-blue-200 opacity-30 dark:bg-blue-600"
                style={{
                  top: `${(selectedRange.start / 15) * CELL_HEIGHT}px`,
                  height: `${((selectedRange.end - selectedRange.start) / 15) * CELL_HEIGHT}px`,
                }}
              />
            )}

            {/* 待创建事件区域 - 仅高亮显示 */}
            {pendingEvent && !isDragging && (
              <div
                className="absolute left-0 right-0 pointer-events-none rounded-lg border-2 border-blue-500 bg-blue-100/50 dark:bg-blue-900/30"
                style={{
                  top: `${(pendingEvent.startMinutes / 15) * CELL_HEIGHT}px`,
                  height: `${((pendingEvent.endMinutes - pendingEvent.startMinutes) / 15) * CELL_HEIGHT - 4}px`,
                }}
              />
            )}

            {/* 事件 */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="pointer-events-auto">
                {timedEvents.map((event) => {
                  const position = eventPositions.get(event.id);
                  const gridPosition = getEventGridPosition(
                    event,
                    GRID_START_TIME,
                    GRID_END_TIME,
                    CELL_HEIGHT,
                  );

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
                      onClick={() => setEditingEvent(event)}
                      className="absolute cursor-pointer rounded border border-white p-1 text-xs text-white shadow-sm"
                      style={{
                        top: `${gridPosition.top}px`,
                        height: `${gridPosition.height}px`,
                        left: position ? `${position.left}%` : "0%",
                        width: position ? `${position.width}%` : "100%",
                        backgroundColor: colorValue,
                        zIndex: position?.zIndex || 1,
                      }}
                    >
                      <div className="font-medium">{event.title}</div>
                      {event.startTime !== null && event.endTime !== null && (
                        <div className="text-xs opacity-90">
                          {formatTime(event.startTime)} -{" "}
                          {formatTime(event.endTime)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayView;
