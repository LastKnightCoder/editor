import { CalendarEvent } from "@/types/calendar";

export const getDateStart = (date: Date | number): number => {
  const d = typeof date === "number" ? new Date(date) : date;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export const getDateEnd = (date: Date | number): number => {
  const d = typeof date === "number" ? new Date(date) : date;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
};

// 将分钟数转换为时间
const minutesToTime = (minutes: number): { hours: number; minutes: number } => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return { hours, minutes: mins };
};

// 对齐到 15 分钟
export const roundToQuarterHour = (minutes: number): number => {
  return Math.round(minutes / 15) * 15;
};

export const getWeekStart = (date: Date | number): number => {
  const d = typeof date === "number" ? new Date(date) : date;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // 调整为星期一
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return getDateStart(monday);
};

export const getWeekEnd = (date: Date | number): number => {
  const d = typeof date === "number" ? new Date(date) : date;
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  const sunday = new Date(d);
  sunday.setDate(d.getDate() + diff);
  return getDateEnd(sunday);
};

// 检测事件是否重叠
export const eventsOverlap = (event1: CalendarEvent, event2: CalendarEvent): boolean => {
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
  const datesOverlap = event1.startDate <= date2End && date1End >= event2.startDate;

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

export const formatTime = (minutes: number): string => {
  const { hours, minutes: mins } = minutesToTime(minutes);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

export const isToday = (timestamp: number): boolean => {
  const today = getDateStart(new Date());
  const date = getDateStart(timestamp);
  return today === date;
};

// 月视图网格范围：首周周一 00:00 → 末周周日 23:59:59.999（含邻月日期，周一起始）
export const getMonthGridRange = (
  year: number,
  month: number
): { start: number; end: number; rows: number } => {
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const rows = Math.ceil((lead + getDaysInMonth(year, month)) / 7);
  const start = new Date(year, month - 1, 1 - lead).getTime();
  const end = new Date(year, month - 1, 1 - lead + rows * 7 - 1, 23, 59, 59, 999).getTime();
  return { start, end, rows };
};
