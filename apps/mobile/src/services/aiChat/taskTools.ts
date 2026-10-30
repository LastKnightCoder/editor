// 待办与日程工具：与桌面同名、入参取桌面 schema 的子集，执行端是应用自己页面用的原生命令。
// 手机端只处理独立待办（不含卡片里的勾选项），不支持周期规则、单次实例与撤销；描述里写明。

import * as tauri from "../tauri";
import { invalidateCalendarQueries } from "../../features/calendar/cache";
import { getQueryClient } from "../../router/query/PageQueryProvider";
import type { TodoItem } from "../../types";
import type { CalendarEvent } from "../../features/calendar/types";
import { failure, integer, objectSchema, ok, text, type HostTool } from "./tool";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = { type: "string", description: "YYYY-MM-DD" };
const time = {
  type: "string",
  description: "本地时间：YYYY-MM-DD（全天）或 YYYY-MM-DDTHH:mm（定时）",
};

function refreshTodos() {
  void getQueryClient().invalidateQueries({ queryKey: ["todo"] });
  void invalidateCalendarQueries();
}

/** 解析本地时间：返回当天 00:00 的毫秒与当天分钟数（全天时为 null） */
export function parseLocal(value: string): { day: number; minutes: number | null } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const day = new Date(Number(y), Number(m) - 1, Number(d));
  if (day.getMonth() !== Number(m) - 1 || day.getDate() !== Number(d)) return null;
  const minutes = hh === undefined ? null : Number(hh) * 60 + Number(mm);
  if (minutes !== null && (minutes < 0 || minutes >= 24 * 60)) return null;
  return { day: day.getTime(), minutes };
}

const toEpoch = (value: string) => {
  const parsed = parseLocal(value);
  return parsed ? parsed.day + (parsed.minutes ?? 0) * 60_000 : null;
};

const pad = (value: number) => String(value).padStart(2, "0");
export function formatLocal(epoch: number | null | undefined, withTime = true) {
  if (!epoch) return null;
  const d = new Date(epoch);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime && (d.getHours() || d.getMinutes())
    ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    : day;
}
const minutesText = (minutes: number | null) =>
  minutes === null ? null : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** 版本：桌面以 revision 防止覆盖他人修改，手机端用 updateTime 承担同一语义 */
const revisionOf = (item: { updateTime: number }) => String(item.updateTime);

function todoView(item: TodoItem, groups: Map<number, string>) {
  return {
    taskRef: String(item.id),
    revision: revisionOf(item),
    title: item.title,
    completed: item.isCompleted,
    archived: item.isArchived,
    dueAt: formatLocal(item.dueAt),
    startAt: formatLocal(item.startAt),
    groupId: String(item.groupId),
    group: groups.get(item.groupId) ?? null,
    parentRef: item.parentId === null ? null : String(item.parentId),
    recurring: !!item.recurrence,
    source: "todo",
  };
}

function eventView(event: CalendarEvent) {
  const start = formatLocal(event.startDate, false)!;
  const end = formatLocal(event.endDate ?? event.startDate, false)!;
  return {
    eventId: String(event.id),
    revision: String(event.id),
    title: event.title,
    allDay: event.allDay,
    start: event.allDay ? start : `${start}T${minutesText(event.startTime)}`,
    end: event.allDay ? end : `${end}T${minutesText(event.endTime ?? event.startTime)}`,
    calendarId: String(event.calendarId),
    calendar: event.calendarTitle,
    system: event.isInSystemEvent,
  };
}

async function loadTodos() {
  const [groups, items] = await Promise.all([
    tauri.todoListGroups(),
    tauri.todoListItemsByType({ type: "all" }),
  ]);
  return { groups: new Map(groups.map(group => [group.id, group.title])), items };
}

async function findTodo(input: Record<string, unknown>) {
  const id = Number(text(input, "taskRef"));
  if (!Number.isSafeInteger(id)) return { error: failure("TASK_NOT_FOUND", "taskRef 无效") };
  const { groups, items } = await loadTodos();
  const item = items.find(value => value.id === id);
  if (!item)
    return { error: failure("TASK_NOT_FOUND", "待办不存在或已删除", { taskRef: String(id) }) };
  const revision = text(input, "revision");
  if (revision !== undefined && revision !== revisionOf(item))
    return {
      error: failure("TASK_REVISION_CONFLICT", "待办已被修改，请先用 query_todos 取得最新版本", {
        current: todoView(item, groups),
      }),
    };
  return { item, groups, items };
}

export const queryTodosTool: HostTool = {
  name: "query_todos",
  risk: "read",
  description:
    "查询独立待办，返回可操作身份（taskRef）和版本（revision）。手机端不含卡片正文里的勾选项与周期实例；复杂聚合用 sql_query。",
  inputSchema: objectSchema({
    keyword: { type: "string", description: "标题关键词" },
    completed: { type: "boolean", description: "按完成状态筛选" },
    archived: { type: "boolean", description: "是否包含归档，默认 false" },
    groupId: { type: "string", description: "清单 id" },
    overdue: { type: "boolean", description: "只看已过期未完成" },
    start: { ...date, description: "截止日期下限（含），YYYY-MM-DD" },
    end: { ...date, description: "截止日期上限（含），YYYY-MM-DD" },
    sort: { type: "string", enum: ["dueAt", "updatedAt", "title"] },
    pageSize: { type: "integer", minimum: 1, maximum: 100 },
  }),
  execute: async input => {
    const { groups, items } = await loadTodos();
    const keyword = text(input, "keyword")?.trim().toLowerCase();
    const start = text(input, "start");
    const end = text(input, "end");
    const startAt = start && DATE.test(start) ? toEpoch(start) : null;
    const endAt = end && DATE.test(end) ? toEpoch(end)! + 86_400_000 - 1 : null;
    const now = Date.now();
    const groupId = Number(text(input, "groupId"));
    let list = items.filter(item => {
      if (input.archived !== true && item.isArchived) return false;
      if (typeof input.completed === "boolean" && item.isCompleted !== input.completed)
        return false;
      if (keyword && !item.title.toLowerCase().includes(keyword)) return false;
      if (Number.isSafeInteger(groupId) && text(input, "groupId") && item.groupId !== groupId)
        return false;
      if (input.overdue === true && (item.isCompleted || !item.dueAt || item.dueAt >= now))
        return false;
      if (startAt !== null && (!item.dueAt || item.dueAt < startAt)) return false;
      if (endAt !== null && (!item.dueAt || item.dueAt > endAt)) return false;
      return true;
    });
    const sort = text(input, "sort") ?? "dueAt";
    list = [...list].sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "updatedAt"
          ? b.updateTime - a.updateTime
          : (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)
    );
    const pageSize = Math.min(Math.max(integer(input, "pageSize") ?? 50, 1), 100);
    return ok({
      success: true,
      total: list.length,
      items: list.slice(0, pageSize).map(item => todoView(item, groups)),
      truncated: list.length > pageSize,
      groups: [...groups].map(([id, title]) => ({ groupId: String(id), title })),
    });
  },
};

export const queryCalendarEventsTool: HostTool = {
  name: "query_calendar_events",
  risk: "read",
  description: "查询日期窗口内的日程，返回 eventId 与版本；系统日程（由待办同步）只读。",
  inputSchema: objectSchema(
    {
      start: { ...date, description: "开始日期（含），YYYY-MM-DD" },
      end: { ...date, description: "结束日期（含），YYYY-MM-DD" },
      calendarIds: { type: "array", items: { type: "string" }, maxItems: 100 },
    },
    ["start", "end"]
  ),
  execute: async input => {
    const start = toEpoch(text(input, "start") ?? "");
    const end = toEpoch(text(input, "end") ?? "");
    if (start === null || end === null || end < start)
      return failure("INVALID_RANGE", "start/end 须为 YYYY-MM-DD，且 end 不早于 start");
    const calendars = await tauri.calendarGetAll();
    const wanted = Array.isArray(input.calendarIds) ? new Set(input.calendarIds.map(String)) : null;
    const calendarIds = calendars
      .filter(calendar => !wanted || wanted.has(String(calendar.id)))
      .map(calendar => calendar.id);
    const events = await tauri.calendarEventGetByDateRange({
      startDate: start,
      endDate: end,
      calendarIds,
      timeZone: tauri.localTimeZone(),
    });
    return ok({
      success: true,
      total: events.length,
      events: events.slice(0, 100).map(eventView),
      calendars: calendars.map(calendar => ({
        calendarId: String(calendar.id),
        title: calendar.title,
        system: calendar.isInSystemGroup,
      })),
    });
  },
};

export const createTodoTool: HostTool = {
  name: "create_todo",
  risk: "write",
  description:
    "创建独立待办，可设截止时间。手机端暂不支持周期规则与写入卡片正文；需要周期任务时告诉用户到电脑端设置。",
  inputSchema: objectSchema(
    {
      title: { type: "string", maxLength: 500 },
      groupId: {
        type: "string",
        description: "清单 id，缺省为第一个清单；用 query_todos 返回的 groups 取得",
      },
      parentRef: { type: "string", description: "父待办 taskRef，创建子待办时填" },
      dueAt: { ...time, description: "截止时间，" + time.description },
    },
    ["title"]
  ),
  execute: async input => {
    const title = text(input, "title")?.trim();
    if (!title) return failure("INVALID_TITLE", "标题不能为空");
    const groups = await tauri.todoListGroups();
    const usable = groups.filter(group => !group.isArchived && !group.isSystem);
    const groupId = text(input, "groupId")
      ? Number(text(input, "groupId"))
      : (usable[0]?.id ?? groups[0]?.id);
    if (!groups.some(group => group.id === groupId))
      return failure("GROUP_NOT_FOUND", "清单不存在", {
        groups: usable.map(group => ({ groupId: String(group.id), title: group.title })),
      });
    const dueText = text(input, "dueAt");
    const dueAt = dueText ? toEpoch(dueText) : null;
    if (dueText && dueAt === null) return failure("INVALID_TIME", "dueAt 格式无效");
    const parent = text(input, "parentRef") ? Number(text(input, "parentRef")) : null;
    const created = await tauri.todoCreateItem({
      groupId: groupId!,
      parentId: parent,
      title,
      dueAt,
    });
    refreshTodos();
    const map = new Map(groups.map(group => [group.id, group.title]));
    return ok({ success: true, operation: "create_todo", item: todoView(created, map) });
  },
};

export const updateTodoTool: HostTool = {
  name: "update_todo",
  risk: "write",
  description:
    "修改待办标题或截止时间。省略不改，dueAt=null 清空。须带 query_todos 返回的 revision。",
  inputSchema: objectSchema(
    {
      taskRef: { type: "string" },
      revision: { type: "string" },
      patch: objectSchema({
        title: { type: "string", maxLength: 500 },
        dueAt: { anyOf: [time, { type: "null" }] },
      }),
    },
    ["taskRef", "revision", "patch"]
  ),
  execute: async input => {
    const found = await findTodo(input);
    if (found.error) return found.error;
    const patch = (input.patch ?? {}) as Record<string, unknown>;
    const next: Parameters<typeof tauri.todoUpdateItem>[0] = { id: found.item.id };
    if (typeof patch.title === "string") {
      if (!patch.title.trim()) return failure("INVALID_TITLE", "标题不能为空");
      next.title = patch.title.trim();
    }
    if (patch.dueAt === null) next.dueAt = null;
    else if (typeof patch.dueAt === "string") {
      const dueAt = toEpoch(patch.dueAt);
      if (dueAt === null) return failure("INVALID_TIME", "dueAt 格式无效");
      next.dueAt = dueAt;
    }
    const updated = await tauri.todoUpdateItem(next);
    refreshTodos();
    return ok({ success: true, operation: "update_todo", item: todoView(updated, found.groups) });
  },
};

export const setTodoCompletedTool: HostTool = {
  name: "set_todo_completed",
  risk: "write",
  description: "完成或恢复待办（子待办一并处理）。手机端不支持完成周期任务的单次实例。",
  inputSchema: objectSchema(
    { taskRef: { type: "string" }, revision: { type: "string" }, completed: { type: "boolean" } },
    ["taskRef", "revision", "completed"]
  ),
  execute: async input => {
    const found = await findTodo(input);
    if (found.error) return found.error;
    if (found.item.recurrence)
      return failure("RECURRING_UNSUPPORTED", "手机端暂不支持完成周期任务的单次实例");
    if (typeof input.completed !== "boolean") return failure("INVALID_INPUT", "completed 必填");
    await tauri.todoToggleCompleteCascade({ id: found.item.id, isCompleted: input.completed });
    refreshTodos();
    return ok({
      success: true,
      operation: "set_todo_completed",
      item: { ...todoView(found.item, found.groups), completed: input.completed },
    });
  },
};

export const deleteTodoTool: HostTool = {
  name: "delete_todo",
  risk: "write",
  description: "删除待办。有子待办时必须给 children=cascade（连同子待办删除）。",
  inputSchema: objectSchema(
    {
      taskRef: { type: "string" },
      revision: { type: "string" },
      children: { type: "string", enum: ["reject", "cascade"] },
    },
    ["taskRef", "revision"]
  ),
  execute: async input => {
    const found = await findTodo(input);
    if (found.error) return found.error;
    const hasChildren = found.items.some(item => item.parentId === found.item.id);
    if (hasChildren && text(input, "children") !== "cascade")
      return failure("TASK_HAS_CHILDREN", "该待办有子待办，需明确 children=cascade");
    await (hasChildren
      ? tauri.todoDeleteItemCascade(found.item.id)
      : tauri.todoDeleteItem(found.item.id));
    refreshTodos();
    return ok({
      success: true,
      operation: "delete_todo",
      item: todoView(found.item, found.groups),
    });
  },
};

async function findEvent(input: Record<string, unknown>) {
  const id = Number(text(input, "eventId"));
  if (!Number.isSafeInteger(id)) return { error: failure("EVENT_NOT_FOUND", "eventId 无效") };
  try {
    const event = await tauri.calendarEventGetById(id);
    if (event.isInSystemEvent)
      return { error: failure("EVENT_READ_ONLY", "系统日程由待办同步，请改用待办工具") };
    return { event };
  } catch {
    return { error: failure("EVENT_NOT_FOUND", "日程不存在或已删除") };
  }
}

/** 起止解析成原生事件字段；全天日程 end 为不含当天的次日（与桌面一致） */
function eventSchedule(startText: string, endText: string, allDay: boolean) {
  const start = parseLocal(startText);
  const end = parseLocal(endText);
  if (!start || !end) return null;
  if (allDay) {
    const lastDay = end.day > start.day ? end.day - 86_400_000 : start.day;
    return {
      startDate: start.day,
      endDate: lastDay > start.day ? lastDay : null,
      startTime: null,
      endTime: null,
      allDay: true,
    };
  }
  if (start.minutes === null || end.minutes === null) return null;
  if (end.day * 1440 + end.minutes <= start.day * 1440 + start.minutes) return null;
  return {
    startDate: start.day,
    endDate: end.day > start.day ? end.day : null,
    startTime: start.minutes,
    endTime: end.minutes,
    allDay: false,
  };
}

export const createCalendarEventTool: HostTool = {
  name: "create_calendar_event",
  risk: "write",
  description:
    "创建独立日程，必须给明确起止。全天日程 start/end 用 YYYY-MM-DD，end 不含当天（当天全天的 end 为次日）；定时日程用 YYYY-MM-DDTHH:mm。",
  inputSchema: objectSchema(
    {
      title: { type: "string", maxLength: 500 },
      start: time,
      end: time,
      allDay: { type: "boolean" },
      calendarId: { type: "string", description: "缺省为第一个非系统日历" },
    },
    ["title", "start", "end", "allDay"]
  ),
  execute: async input => {
    const title = text(input, "title")?.trim();
    if (!title) return failure("INVALID_TITLE", "标题不能为空");
    const schedule = eventSchedule(
      text(input, "start") ?? "",
      text(input, "end") ?? "",
      input.allDay === true
    );
    if (!schedule) return failure("INVALID_TIME", "起止时间无效，或结束不晚于开始");
    const calendars = await tauri.calendarGetAll();
    const usable = calendars.filter(calendar => !calendar.isInSystemGroup && !calendar.archived);
    const calendarId = text(input, "calendarId")
      ? Number(text(input, "calendarId"))
      : usable[0]?.id;
    if (!usable.some(calendar => calendar.id === calendarId))
      return failure("CALENDAR_NOT_FOUND", "日历不存在或不可写", {
        calendars: usable.map(calendar => ({
          calendarId: String(calendar.id),
          title: calendar.title,
        })),
      });
    const created = await tauri.calendarEventCreate({
      calendarId: calendarId!,
      title,
      ...schedule,
    });
    void invalidateCalendarQueries();
    return ok({ success: true, operation: "create_calendar_event", event: eventView(created) });
  },
};

export const updateCalendarEventTool: HostTool = {
  name: "update_calendar_event",
  risk: "write",
  description: "修改用户日程的标题或起止；不能修改系统日程。改起止时 start、end、allDay 一起给。",
  inputSchema: objectSchema(
    {
      eventId: { type: "string" },
      revision: { type: "string" },
      patch: objectSchema({
        title: { type: "string" },
        start: time,
        end: time,
        allDay: { type: "boolean" },
      }),
    },
    ["eventId", "patch"]
  ),
  execute: async input => {
    const found = await findEvent(input);
    if (found.error) return found.error;
    const { event } = found;
    const patch = (input.patch ?? {}) as Record<string, unknown>;
    let schedule = {
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      allDay: event.allDay,
    };
    if (patch.start !== undefined || patch.end !== undefined) {
      const next = eventSchedule(
        String(patch.start ?? ""),
        String(patch.end ?? ""),
        patch.allDay === true
      );
      if (!next) return failure("INVALID_TIME", "起止时间无效，或结束不晚于开始");
      schedule = next;
    }
    const title =
      typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : event.title;
    const updated = await tauri.calendarEventUpdate({
      id: event.id,
      calendarId: event.calendarId,
      title,
      detailContentId: event.detailContentId,
      color: event.color,
      ...schedule,
    });
    void invalidateCalendarQueries();
    return ok({ success: true, operation: "update_calendar_event", event: eventView(updated) });
  },
};

export const deleteCalendarEventTool: HostTool = {
  name: "delete_calendar_event",
  risk: "write",
  description: "删除用户日程；系统日程改用待办工具。",
  inputSchema: objectSchema({ eventId: { type: "string" }, revision: { type: "string" } }, [
    "eventId",
  ]),
  execute: async input => {
    const found = await findEvent(input);
    if (found.error) return found.error;
    await tauri.calendarEventDelete(found.event.id);
    void invalidateCalendarQueries();
    return ok({ success: true, operation: "delete_calendar_event", event: eventView(found.event) });
  },
};

export const TASK_TOOLS: readonly HostTool[] = [
  queryTodosTool,
  queryCalendarEventsTool,
  createTodoTool,
  updateTodoTool,
  setTodoCompletedTool,
  deleteTodoTool,
  createCalendarEventTool,
  updateCalendarEventTool,
  deleteCalendarEventTool,
];
