import type { DataAdapter, DataEntity } from "@tau/plugins/host";
import type {
  PluginArticle,
  PluginCalendarEvent,
  PluginCard,
  PluginContext,
  PluginDocument,
  PluginTodo,
} from "@tau/plugins";
import {
  taskKey,
  type AssistantCalendarEvent,
  type AssistantQueryResult,
  type AssistantTask,
} from "@tau/shared/task-assistant";
import * as dataCommands from "@/commands/plugin-data";
import { taskAssistantRequest } from "@/commands/task-assistant";
import { bindDatabaseCommands } from "@/services/command-context";
import type { PluginDataRecord } from "@/types/plugin-data";

/** ContentRef 对插件不透明：正文 ID 加创建时间，防止 ID 复用后指向别的正文 */
export const encodeContentRef = (contentId: number, createdAt: number) =>
  `${contentId}:${createdAt}`;

export function decodeContentRef(ref: string): { contentId: number; createdAt: number } | null {
  const match = /^(\d+):(\d+)$/.exec(ref);
  if (!match) return null;
  const contentId = Number(match[1]);
  const createdAt = Number(match[2]);
  return Number.isSafeInteger(contentId) && contentId > 0 && Number.isSafeInteger(createdAt)
    ? { contentId, createdAt }
    : null;
}

const parseId = (id: string) => (/^\d+$/.test(id) ? Number(id) : null);

function toEntity(record: PluginDataRecord): PluginCard | PluginArticle | PluginDocument {
  const contentRef =
    record.contentId !== null && record.contentCreatedAt !== null
      ? encodeContentRef(record.contentId, record.contentCreatedAt)
      : null;
  const base = {
    id: String(record.id),
    title: record.title,
    tags: record.tags,
    wordCount: record.wordCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  if (record.entity === "document")
    return {
      ...base,
      kind: record.kind ?? "document",
      contentRef,
      projectIds: (record.projectIds ?? []).map(String),
    };
  return { ...base, pinned: record.pinned, contentRef: contentRef ?? "" };
}

const SOURCE_KINDS = {
  card: "card",
  article: "article",
  "project-item": "document",
  "diary-moment": "diary",
} as const;

function toTodo(task: AssistantTask): PluginTodo {
  return {
    id: task.occurrence
      ? `${taskKey(task.taskRef)}@${task.occurrence.occurrenceDate}`
      : taskKey(task.taskRef),
    title: task.title,
    completed: task.completed,
    archived: task.archived,
    dueAt: task.dueAt,
    ...(task.sourceRef
      ? {
          source: {
            kind: SOURCE_KINDS[task.sourceRef.kind],
            id: String(task.sourceRef.id),
            ...(task.sourceTitle ? { title: task.sourceTitle } : {}),
          },
        }
      : {}),
  };
}

function toEvent(event: AssistantCalendarEvent): PluginCalendarEvent {
  return {
    id: event.occurrence
      ? `${event.eventId}:${event.createdAt}@${event.occurrence.occurrenceDate}`
      : `${event.eventId}:${event.createdAt}`,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    calendarId: String(event.calendarId),
    ...(event.taskRef ? { todoId: taskKey(event.taskRef) } : {}),
  };
}

/** 插件业务数据只读适配：所有命令固定到宿主创建时的数据库，并随插件实例的 signal 取消。 */
export function createDesktopData(databaseName: string): DataAdapter {
  const bound = (context: PluginContext) =>
    bindDatabaseCommands(
      { ...dataCommands, taskAssistantRequest },
      { databaseName, signal: context.signal }
    );
  const tasks = <T>(context: PluginContext, name: string, args: Record<string, unknown>) =>
    bound(context).taskAssistantRequest<AssistantQueryResult<T>>(
      "task-assistant:read",
      [name, args],
      databaseName,
      context.signal
    );
  return {
    async query(context, entity: DataEntity, query) {
      const page = await bound(context).queryPluginData(databaseName, entity, query);
      return { items: page.items.map(toEntity), ...(page.cursor ? { cursor: page.cursor } : {}) };
    },
    async get(context, entity, id) {
      const numeric = parseId(id);
      if (numeric === null) return null;
      const record = await bound(context).getPluginData(databaseName, entity, numeric);
      return record ? toEntity(record) : null;
    },
    async todos(context, { limit, ...query }) {
      const result = await tasks<AssistantTask>(context, "query_todos", {
        ...query,
        pageSize: limit,
      });
      return {
        items: result.items.map(toTodo),
        ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
      };
    },
    async calendar(context, { limit, ...query }) {
      const result = await tasks<AssistantCalendarEvent>(context, "query_calendar_events", {
        ...query,
        pageSize: limit,
      });
      return {
        items: result.items.map(toEvent),
        ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
      };
    },
    async readContent(context, ref, format) {
      const decoded = decodeContentRef(ref);
      if (!decoded) return null;
      const record = await bound(context).readPluginContent(
        databaseName,
        decoded.contentId,
        decoded.createdAt,
        format
      );
      if (!record) return null;
      return {
        owners: record.owners,
        snapshot: {
          ref,
          ...(record.markdown !== undefined ? { markdown: record.markdown } : {}),
          ...(record.nodes !== undefined ? { nodes: record.nodes } : {}),
          wordCount: record.wordCount,
          updatedAt: record.updatedAt,
        },
      };
    },
  };
}
