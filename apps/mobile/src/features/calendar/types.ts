// 日历领域类型：与桌面端 apps/desktop/src/types/calendar.ts 及 Rust 侧
// calendar_types.rs（serde camelCase）保持一致。日期字段为本地 00:00 时间戳，
// 时刻字段为当天分钟数 0-1439（与桌面共享同一套数据语义）。

// 17 个数据色值是开放字符串集合（两端库内已有数据为准），不以联合类型收窄
export type CalendarColorName = string;

export interface Calendar {
  id: number;
  title: string;
  color: string;
  descriptionContentId: number;
  archived: boolean;
  pinned: boolean;
  visible: boolean;
  orderIndex: number;
  groupId: number | null;
  createTime: number;
  updateTime: number;
  /** 派生字段：自身或父分组 is_system（两层语义） */
  isInSystemGroup: boolean;
  /** 派生字段：日历下事件数（管理页与删除确认展示） */
  eventCount: number;
}

export interface CalendarEvent {
  id: number;
  calendarId: number;
  title: string;
  detailContentId: number;
  startDate: number;
  /** 跨天事件的结束日期（本地 00:00），同日事件为 null */
  endDate: number | null;
  startTime: number | null;
  endTime: number | null;
  /** 覆盖日历色，null = 继承日历颜色 */
  color: string | null;
  allDay: boolean;
  /** 仅详情查询预加载的 Slate JSON */
  detailContent?: unknown | null;
  calendarTitle: string | null;
  calendarColor: string | null;
  isInSystemEvent: boolean;
}

export interface CreateCalendarEventInput {
  calendarId: number;
  title: string;
  detailContentId?: number;
  detailContent?: unknown[];
  detailContentCount?: number;
  startDate: number;
  endDate?: number | null;
  startTime?: number | null;
  endTime?: number | null;
  color?: string | null;
  allDay: boolean;
}

export interface UpdateCalendarEventInput extends CreateCalendarEventInput {
  id: number;
}
