import useCalendarStore from "@/stores/useCalendarStore";
import { CalendarEvent } from "@/types";

/**
 * 根据当前视图和选中的日历加载事件
 */
export const useCalendarEvents = () => {
  const { events, loading } = useCalendarStore();
  return { events, loading };
};

/**
 * 获取全天事件
 */
export const useAllDayEvents = (events: CalendarEvent[]) => {
  return events.filter((event) => event.allDay);
};

/**
 * 获取有时间范围的事件
 */
export const useTimedEvents = (events: CalendarEvent[]) => {
  return events.filter((event) => !event.allDay);
};
