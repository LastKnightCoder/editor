import { CalendarEvent } from "@/types/calendar";

// 获取日期的开始时间戳（00:00:00）
export const getDateStart = (date: Date | number): number => {
  const d = typeof date === "number" ? new Date(date) : date;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// 获取日期的结束时间戳（23:59:59.999）
export const getDateEnd = (date: Date | number): number => {
  const d = typeof date === "number" ? new Date(date) : date;
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
};

// 将时间转换为分钟数（用于 start_time/end_time）
export const timeToMinutes = (hours: number, minutes: number): number => {
  return hours * 60 + minutes;
};

// 将分钟数转换为时间
export const minutesToTime = (
  minutes: number,
): { hours: number; minutes: number } => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return { hours, minutes: mins };
};

// 对齐到 15 分钟
export const roundToQuarterHour = (minutes: number): number => {
  return Math.round(minutes / 15) * 15;
};

// 获取周的开始日期（星期一）
export const getWeekStart = (date: Date | number): number => {
  const d = typeof date === "number" ? new Date(date) : date;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // 调整为星期一
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return getDateStart(monday);
};

// 获取周的结束日期（星期日）
export const getWeekEnd = (date: Date | number): number => {
  const d = typeof date === "number" ? new Date(date) : date;
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  const sunday = new Date(d);
  sunday.setDate(d.getDate() + diff);
  return getDateEnd(sunday);
};

// 获取月的开始日期
export const getMonthStart = (year: number, month: number): number => {
  return new Date(year, month - 1, 1).getTime();
};

// 获取月的结束日期
export const getMonthEnd = (year: number, month: number): number => {
  return new Date(year, month, 0, 23, 59, 59, 999).getTime();
};

// 检测事件是否重叠
export const eventsOverlap = (
  event1: CalendarEvent,
  event2: CalendarEvent,
): boolean => {
  // 如果都是全天事件，只比较日期
  if (event1.allDay && event2.allDay) {
    const end1 = event1.endDate || event1.startDate;
    const end2 = event2.endDate || event2.startDate;
    return event1.startDate <= end2 && end1 >= event2.startDate;
  }

  // 如果有一个是全天事件，不认为它们重叠（全天事件在不同区域显示）
  if (event1.allDay || event2.allDay) {
    return false;
  }

  // 两个都不是全天事件，比较时间
  const start1 = event1.startTime || 0;
  const end1 = event1.endTime || 1439;
  const start2 = event2.startTime || 0;
  const end2 = event2.endTime || 1439;

  // 首先检查日期是否重叠
  const date1End = event1.endDate || event1.startDate;
  const date2End = event2.endDate || event2.startDate;
  const datesOverlap =
    event1.startDate <= date2End && date1End >= event2.startDate;

  if (!datesOverlap) {
    return false;
  }

  // 如果是同一天，检查时间是否重叠
  if (event1.startDate === event2.startDate) {
    return start1 < end2 && end1 > start2;
  }

  // 如果跨多天，认为它们重叠
  return true;
};

// 计算事件在时间网格中的位置
export const getEventGridPosition = (
  event: CalendarEvent,
  gridStartTime: number, // 网格开始时间（分钟）
  gridEndTime: number, // 网格结束时间（分钟）
  cellHeight: number, // 每个时间单元格高度（px）
): { top: number; height: number } => {
  const startTime = event.startTime || gridStartTime;
  const endTime = event.endTime || gridEndTime;

  // 计算相对于网格开始的分钟数
  const startMinutes = Math.max(startTime - gridStartTime, 0);
  const endMinutes = Math.min(
    endTime - gridStartTime,
    gridEndTime - gridStartTime,
  );

  // 计算像素位置（假设每个单元格代表 15 分钟）
  const minutesPerCell = 15;
  const top = (startMinutes / minutesPerCell) * cellHeight;
  const height = ((endMinutes - startMinutes) / minutesPerCell) * cellHeight;

  return { top, height };
};

// 格式化时间显示（分钟数转为 HH:MM）
export const formatTime = (minutes: number): string => {
  const { hours, minutes: mins } = minutesToTime(minutes);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

// 格式化日期显示
export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
};

// 获取当前月份的天数
export const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

// 获取某月第一天是星期几（0-6，0 表示星期日）
export const getFirstDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month - 1, 1).getDay();
};

// 判断是否是今天
export const isToday = (timestamp: number): boolean => {
  const today = getDateStart(new Date());
  const date = getDateStart(timestamp);
  return today === date;
};

// 判断是否是同一天
export const isSameDay = (date1: number, date2: number): boolean => {
  return getDateStart(date1) === getDateStart(date2);
};
