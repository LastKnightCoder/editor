import {
  isQuerySource,
  QUERY_LIMITS,
  querySerializedBytes,
  type QueryReader,
  type QueryRecord,
} from "@tau/shared/query-database";
import { readQueryData } from "@/commands/query-database";
import { taskAssistantRequest } from "@/commands/task-assistant";
import { bindDatabaseCommands } from "@/services/command-context";
import {
  taskKey,
  type AssistantTask,
  type AssistantCalendarEvent,
  type AssistantQueryResult,
} from "@tau/shared/task-assistant";

const commands = { readQueryData, taskAssistantRequest };
const sourceKinds: Record<string, string> = {
  card: "card",
  article: "article",
  "project-item": "document",
  "diary-moment": "diary",
};

export function createQueryReader(
  databaseName: string,
  connectionId: string | undefined,
  signal: AbortSignal
): QueryReader {
  const bound = bindDatabaseCommands(commands, {
    databaseName,
    connectionId,
    signal,
  });
  return async request => {
    signal.throwIfAborted();
    if (
      !isQuerySource(request?.source) ||
      (request.options !== undefined &&
        (!request.options || typeof request.options !== "object" || Array.isArray(request.options)))
    )
      throw new Error("查询读取请求无效");
    if (request.source !== "todos" && request.source !== "calendar")
      return bound.readQueryData(request);
    const options = request.options ?? {};
    const allowed =
      request.source === "todos"
        ? [
            "view",
            "source",
            "completed",
            "archived",
            "keyword",
            "start",
            "end",
            "groupId",
            "contentId",
          ]
        : ["view", "start", "end", "calendarIds"];
    const args: Record<string, unknown> = Object.fromEntries(
      Object.entries(options).filter(([key]) => allowed.includes(key))
    );
    if (request.source === "todos") {
      args.source ??= "all";
      if (options.listId !== undefined) {
        args.groupId = Number(options.listId);
        args.source = "todo";
      }
    }
    args.pageSize = 100;
    if (request.cursor) args.cursor = request.cursor;
    const result = await bound.taskAssistantRequest<
      AssistantQueryResult<AssistantTask | AssistantCalendarEvent>
    >(
      "task-assistant:read",
      [request.source === "todos" ? "query_todos" : "query_calendar_events", args],
      databaseName,
      signal
    );
    signal.throwIfAborted();
    if (result.warnings?.length) throw new Error(result.warnings.join("；"));
    const items = result.items.map((item): QueryRecord => {
      if ("taskRef" in item && "completed" in item) {
        const task = item as AssistantTask;
        const id =
          taskKey(task.taskRef) + (task.occurrence ? `@${task.occurrence.occurrenceDate}` : "");
        return {
          id,
          title: task.title,
          completed:
            (task.isSeries ?? !!task.recurrence?.length) && !task.occurrence
              ? false
              : task.completed,
          archived: task.archived,
          dueAt: task.dueAt,
          listId: task.groupId === null ? null : String(task.groupId),
          recurrence: JSON.parse(JSON.stringify(task.recurrence ?? null)),
          source: task.sourceRef
            ? {
                kind: sourceKinds[task.sourceRef.kind],
                id: String(task.sourceRef.id),
                title: task.sourceTitle ?? task.title,
              }
            : { kind: "todo", id, title: task.title },
        };
      }
      const event = item as AssistantCalendarEvent;
      return {
        id: `${event.eventId}:${event.createdAt}${event.occurrence ? `@${event.occurrence.occurrenceDate}` : ""}`,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        calendarId: String(event.calendarId),
        kind: event.eventId < 0 ? "virtual" : event.taskRef ? "todo-schedule" : "event",
        source:
          event.eventId < 0
            ? null
            : event.taskRef
              ? { kind: "todo", id: taskKey(event.taskRef), title: event.title }
              : {
                  kind: "event",
                  id: String(event.eventId),
                  createdAt: event.createdAt,
                  title: event.title,
                },
      };
    });
    if (querySerializedBytes(items) > QUERY_LIMITS.bytes)
      throw new Error("读取的数据过大，请缩小范围");
    return {
      items,
      ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
    };
  };
}
