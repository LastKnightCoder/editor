// 确认卡的字段：把写入工具的入参翻译成「将会出现的那条待办 / 日程」。
// 清单名、日历名与修改前的旧值需要查一次本机数据；插件与未知工具列出入参的顶层字段。

import { useQuery } from "@tanstack/react-query";
import * as tauri from "../../../services/tauri";
import { eventView, todoView } from "../../../services/aiChat/taskTools";
import { formatDue, formatEventRange, str } from "./format";

type Data = Record<string, unknown>;

export interface PreviewField {
  label: string;
  value: string;
  /** 修改前的值（划掉显示） */
  before?: string;
}

export interface ApprovalPreview {
  fields: PreviewField[];
  /** 需要用户特别注意的后果（连同子待办一起删除等） */
  warning?: string;
}

const TODO_TOOLS = new Set(["update_todo", "set_todo_completed", "delete_todo"]);
const EVENT_TOOLS = new Set(["update_calendar_event", "delete_calendar_event"]);

async function loadTodo(taskRef: number) {
  const [groups, items] = await Promise.all([
    tauri.todoListGroups(),
    tauri.todoListItemsByType({ type: "all" }),
  ]);
  const item = items.find(value => value.id === taskRef);
  if (!item) return null;
  return {
    view: todoView(item, new Map(groups.map(group => [group.id, group.title]))),
    children: items.filter(value => value.parentId === item.id).length,
  };
}

function field(
  label: string,
  value: string | null | undefined,
  before?: string | null
): PreviewField[] {
  if (!value) return [];
  return [{ label, value, ...(before && before !== value ? { before } : {}) }];
}

function genericFields(input: Data): PreviewField[] {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 6)
    .map(([key, value]) => {
      const text = typeof value === "object" ? JSON.stringify(value) : String(value);
      return { label: key, value: text.length > 80 ? `${text.slice(0, 80)}…` : text };
    });
}

export function useApprovalPreview(toolName: string, input: Data): ApprovalPreview | null {
  const taskRef = Number(str(input.taskRef));
  const eventId = Number(str(input.eventId));
  const todo = useQuery({
    queryKey: ["ai-chat", "approval", "todo", taskRef],
    queryFn: () => loadTodo(taskRef),
    enabled: TODO_TOOLS.has(toolName) && Number.isSafeInteger(taskRef),
    staleTime: 5_000,
  });
  const event = useQuery({
    queryKey: ["ai-chat", "approval", "event", eventId],
    queryFn: async () => eventView(await tauri.calendarEventGetById(eventId)),
    enabled: EVENT_TOOLS.has(toolName) && Number.isSafeInteger(eventId),
    staleTime: 5_000,
  });
  const groups = useQuery({
    queryKey: ["ai-chat", "approval", "todo-groups"],
    queryFn: tauri.todoListGroups,
    enabled: toolName === "create_todo",
    staleTime: 30_000,
  });
  const calendars = useQuery({
    queryKey: ["ai-chat", "approval", "calendars"],
    queryFn: tauri.calendarGetAll,
    enabled: toolName === "create_calendar_event",
    staleTime: 30_000,
  });

  const patch = (input.patch ?? {}) as Data;
  switch (toolName) {
    case "create_todo": {
      const groupId = Number(str(input.groupId));
      const usable = groups.data?.filter(group => !group.isArchived && !group.isSystem);
      const group = str(input.groupId)
        ? groups.data?.find(item => item.id === groupId)
        : usable?.[0];
      return {
        fields: [
          ...field("标题", str(input.title)),
          ...field("截止", formatDue(input.dueAt)),
          ...field("清单", group?.title),
        ],
      };
    }
    case "update_todo":
    case "set_todo_completed":
    case "delete_todo": {
      if (!todo.data)
        return todo.isPending && todo.fetchStatus !== "idle"
          ? null
          : { fields: genericFields(input) };
      const { view, children } = todo.data;
      if (toolName === "update_todo") {
        const nextDue = patch.dueAt === null ? "不设截止" : formatDue(patch.dueAt);
        return {
          fields: [
            ...field("标题", str(patch.title) ?? view.title, view.title),
            ...(patch.dueAt !== undefined
              ? field("截止", nextDue, formatDue(view.dueAt) ?? "不设截止")
              : field("截止", formatDue(view.dueAt))),
            ...field("清单", view.group),
          ],
        };
      }
      return {
        fields: [...field("标题", view.title), ...field("截止", formatDue(view.dueAt))],
        warning: children
          ? toolName === "delete_todo"
            ? `连同 ${children} 个子待办一起删除`
            : input.completed !== false
              ? `${children} 个子待办会一起完成`
              : undefined
          : undefined,
      };
    }
    case "create_calendar_event": {
      const calendarId = Number(str(input.calendarId));
      const usable = calendars.data?.filter(item => !item.isInSystemGroup && !item.archived);
      const calendar = str(input.calendarId)
        ? calendars.data?.find(item => item.id === calendarId)
        : usable?.[0];
      return {
        fields: [
          ...field("标题", str(input.title)),
          ...field(
            "时间",
            formatEventRange(input.start, input.end, input.allDay === true, { endExclusive: true })
          ),
          ...field("日历", calendar?.title),
        ],
      };
    }
    case "update_calendar_event":
    case "delete_calendar_event": {
      if (!event.data)
        return event.isPending && event.fetchStatus !== "idle"
          ? null
          : { fields: genericFields(input) };
      const current = event.data;
      const currentRange = formatEventRange(current.start, current.end, current.allDay);
      if (toolName === "delete_calendar_event")
        return {
          fields: [
            ...field("标题", current.title),
            ...field("时间", currentRange),
            ...field("日历", current.calendar),
          ],
        };
      const moved = patch.start !== undefined || patch.end !== undefined;
      return {
        fields: [
          ...field("标题", str(patch.title) ?? current.title, current.title),
          ...field(
            "时间",
            moved
              ? formatEventRange(patch.start, patch.end, patch.allDay === true, {
                  endExclusive: true,
                })
              : currentRange,
            currentRange
          ),
          ...field("日历", current.calendar),
        ],
      };
    }
    default:
      return { fields: genericFields(input) };
  }
}
