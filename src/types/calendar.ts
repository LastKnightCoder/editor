import { Descendant } from "slate";
import { ProjectColorName } from "@/constants/project-colors";

export interface Calendar {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  color: ProjectColorName;
  description: Descendant[];
  descriptionContentId: number;
  archived: boolean;
  pinned: boolean;
  visible: boolean;
  orderIndex: number;
}

export type CreateCalendar = Omit<
  Calendar,
  "id" | "createTime" | "updateTime" | "description"
>;
export type UpdateCalendar = Omit<Calendar, "createTime" | "updateTime">;

export interface CalendarEvent {
  id: number;
  createTime: number;
  updateTime: number;
  calendarId: number;
  title: string;
  detailContentId: number;
  startDate: number; // 时间戳（日期部分）
  endDate: number | null; // 时间戳（日期部分）
  startTime: number | null; // 分钟数 0-1439
  endTime: number | null; // 分钟数 0-1439
  color: ProjectColorName | null;
  allDay: boolean;
}

export type CreateCalendarEvent = Omit<
  CalendarEvent,
  "id" | "createTime" | "updateTime"
>;
export type UpdateCalendarEvent = Omit<
  CalendarEvent,
  "createTime" | "updateTime"
>;

// 视图类型
export type CalendarViewType = "day" | "week" | "month";

// 时间范围查询参数
export interface DateRangeQuery {
  startDate: number;
  endDate: number;
}

// 带日历信息的事件（用于前端展示）
export interface CalendarEventWithCalendar extends CalendarEvent {
  calendar?: Calendar;
}
