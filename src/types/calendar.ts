import { Descendant } from "slate";
import { ProjectColorName } from "@/constants/project-colors";

export interface CalendarGroup {
  id: number;
  name: string;
  isSystem: boolean;
  orderIndex: number;
  createTime: number;
  updateTime: number;
}

export type CreateCalendarGroup = Omit<
  CalendarGroup,
  "id" | "createTime" | "updateTime"
>;
export type UpdateCalendarGroup = Omit<
  CalendarGroup,
  "createTime" | "updateTime"
>;

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
  groupId?: number;
  isInSystemGroup?: boolean;
}

export type CreateCalendar = Omit<
  Calendar,
  "id" | "createTime" | "updateTime" | "description" | "isInSystemGroup"
>;
export type UpdateCalendar = Omit<
  Calendar,
  "createTime" | "updateTime" | "isInSystemGroup"
>;

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
  value?: number; // 可选的数值字段，用于存储如时间成本等数值
  detailContent?: Descendant[]; // 预加载的描述内容
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
export type CalendarViewType = "day" | "week" | "month" | "agenda";

// 时间范围查询参数
export interface DateRangeQuery {
  startDate: number;
  endDate: number;
}

// 带日历信息的事件（用于前端展示）
export interface CalendarEventWithCalendar extends CalendarEvent {
  calendar?: Calendar;
}
