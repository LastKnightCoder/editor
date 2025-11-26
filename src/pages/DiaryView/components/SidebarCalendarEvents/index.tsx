import { memo, useState, useEffect, useMemo } from "react";
import useCalendarStore from "@/stores/useCalendarStore";
import useSettingStore from "@/stores/useSettingStore";
import { getEventsForDay, getAllCalendars } from "@/commands/calendar";
import { getDateStart, formatTime } from "@/utils/calendar";
import { getProjectColorValue } from "@/constants/project-colors";
import { hexToRgba } from "@/pages/Calendar/utils";
import { CalendarEvent, Calendar } from "@/types";
import dayjs from "dayjs";

interface SidebarCalendarEventsProps {
  date: string; // YYYY-MM-DD 格式
}

const SidebarCalendarEvents = memo(({ date }: SidebarCalendarEventsProps) => {
  const { setEditingEvent } = useCalendarStore();
  const { setting } = useSettingStore();
  const theme = setting.darkMode ? "dark" : "light";

  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载日历和当天事件
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // 先获取所有日历
        const allCalendars = await getAllCalendars();
        setCalendars(allCalendars);

        // 获取可见日历的 ID
        const visibleCalendarIds = allCalendars
          .filter((c) => c.visible && !c.archived)
          .map((c) => c.id);

        if (visibleCalendarIds.length > 0) {
          const dayStart = getDateStart(dayjs(date).valueOf());
          const dayEvents = await getEventsForDay(dayStart, visibleCalendarIds);
          setEvents(dayEvents);
        } else {
          setEvents([]);
        }
      } catch (error) {
        console.error("Failed to load calendar events:", error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [date]);

  // 排序：全天事件在前，然后按 startTime 排序
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      if (!a.allDay && !b.allDay) {
        const aTime = a.startTime ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.startTime ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      }
      return 0;
    });
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-sm text-gray-400 dark:text-gray-500">
          加载中...
        </span>
      </div>
    );
  }

  if (sortedEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <span className="text-sm text-gray-400 dark:text-gray-500">
          暂无日程安排
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {sortedEvents.map((event) => {
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
            className="group flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            {/* 时间轴 */}
            <div className="flex flex-shrink-0 flex-col items-center pt-1">
              <div
                className="h-2.5 w-2.5 rounded-full border-2 bg-white dark:bg-gray-900"
                style={{ borderColor: colorValue }}
              />
              <div className="mt-1 whitespace-nowrap text-[10px] text-gray-500 dark:text-gray-400">
                {event.allDay
                  ? "全天"
                  : event.startTime !== null
                    ? formatTime(event.startTime)
                    : ""}
              </div>
            </div>

            {/* 事件卡片 */}
            <div className="min-w-0 flex-1">
              <div
                className="rounded border-l-[3px] px-3 py-2"
                style={{
                  borderLeftColor: colorValue,
                  backgroundColor: hexToRgba(colorValue, 0.1),
                }}
              >
                {/* 时间范围（非全天事件） */}
                {!event.allDay &&
                  event.startTime !== null &&
                  event.endTime !== null && (
                    <div
                      className="mb-0.5 text-[11px] font-medium"
                      style={{ color: colorValue }}
                    >
                      {formatTime(event.startTime)} -{" "}
                      {formatTime(event.endTime)}
                    </div>
                  )}

                {/* 标题 */}
                <div className="truncate text-[13px] font-medium text-gray-900 dark:text-white">
                  {event.title || "无标题"}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default SidebarCalendarEvents;
