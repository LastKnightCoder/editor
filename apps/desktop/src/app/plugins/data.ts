import type { CalendarWrite, DataAdapter, DataEntity, TodoWrite } from "@tau/plugins/host";
import {
  PluginConflictError,
  type PluginArticle,
  type PluginCalendarEvent,
  type PluginCard,
  type PluginContext,
  type PluginDocument,
  type PluginTodo,
} from "@tau/plugins";
import {
  taskKey,
  type AssistantCalendarEvent,
  type AssistantQueryResult,
  type AssistantTask,
  type TaskOperationResult,
  type TaskRef,
} from "@tau/shared/task-assistant";
import * as dataCommands from "@/commands/plugin-data";
import { taskAssistantRequest } from "@/commands/task-assistant";
import { bindDatabaseCommands } from "@/services/command-context";
import { queryClient } from "@/queryClient";
import { invalidatePluginEntityAppearance } from "@/services/plugin-entity-kinds";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import type { ICard } from "@/types";
import type { PluginDataRecord, PluginOperationRecord } from "@/types/plugin-data";

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

/** 与主进程 tables/plugin-data.ts 的 CONFLICT_PREFIX 一致 */
const CONFLICT_PREFIX = "PLUGIN_CONFLICT:";

/** 主进程错误经 IPC 只剩消息；版本冲突转成插件可识别的 PluginConflictError */
export async function mapConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const index = message.indexOf(CONFLICT_PREFIX);
    if (index >= 0) throw new PluginConflictError(message.slice(index + CONFLICT_PREFIX.length));
    if (message.includes("CONTENT_VERSION_CONFLICT")) throw new PluginConflictError();
    throw error;
  }
}

/** 待办 ID 即 taskKey（周期实例另带 @日期），反向解析为助理协议的 TaskRef */
function parseTodoId(id: string): { taskRef: TaskRef; occurrenceDate?: string } {
  const [key, occurrenceDate] = id.split("@");
  const todo = /^todo:(\d+):(\d+)$/.exec(key);
  if (todo)
    return {
      taskRef: { kind: "todo", todoId: Number(todo[1]), createdAt: Number(todo[2]) },
      ...(occurrenceDate ? { occurrenceDate } : {}),
    };
  const document = /^document:(\d+):(\d+):(.+)$/.exec(key);
  if (document)
    return {
      taskRef: {
        kind: "document",
        contentId: Number(document[1]),
        createdAt: Number(document[2]),
        taskId: document[3],
      },
      ...(occurrenceDate ? { occurrenceDate } : {}),
    };
  throw new Error("待办 ID 无效");
}

function parseEventId(id: string): { eventId: number; createdAt: number } {
  const match = /^(\d+):(\d+)$/.exec(id.split("@")[0]);
  if (!match) throw new Error("日程 ID 无效");
  return { eventId: Number(match[1]), createdAt: Number(match[2]) };
}

function toEntity(record: PluginDataRecord): PluginCard | PluginArticle | PluginDocument {
  const contentRef =
    record.contentId !== null && record.contentCreatedAt !== null
      ? encodeContentRef(record.contentId, record.contentCreatedAt)
      : null;
  const base = {
    id: String(record.id),
    revision: record.revision,
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
    revision: task.revision,
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
    revision: event.revision,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    calendarId: String(event.calendarId),
    ...(event.taskRef ? { todoId: taskKey(event.taskRef) } : {}),
  };
}

/**
 * 插件业务数据适配：所有命令固定到宿主创建时的数据库，并随插件实例的 signal 取消。
 * 写入沿用宿主已有的广播让各窗口刷新；卡片删除与文章列表在本窗口补发通知。
 */
export interface DesktopDataAdapter extends DataAdapter {
  /** 插件详情页：该插件最近 7 天的可恢复操作 */
  operations(pluginId: string): Promise<PluginOperationRecord[]>;
  restore(operation: PluginOperationRecord): Promise<void>;
}

export function createDesktopData(databaseName: string): DesktopDataAdapter {
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
  const taskReceipt = async (
    context: PluginContext,
    name: string,
    item: Record<string, unknown>
  ): Promise<TaskOperationResult> => {
    const receipt = await runTaskWrite(
      bound(context).taskAssistantRequest,
      name,
      item,
      `plugin:${context.pluginId}`,
      context.signal
    );
    if (receipt.status === "failed") {
      if (receipt.error?.code === "VERSION_CONFLICT")
        throw new PluginConflictError(receipt.error.message);
      throw new Error(receipt.error?.message ?? "操作失败");
    }
    return receipt;
  };
  const taskWrite = async (context: PluginContext, name: string, item: Record<string, unknown>) =>
    (await taskReceipt(context, name, item)).result;
  const readTask = async (context: PluginContext, taskRef: TaskRef) => {
    const result = await tasks<AssistantTask>(context, "query_todos", {
      taskRefs: [taskRef],
      pageSize: 1,
    });
    return result.items[0];
  };
  const todoTitle = async (context: PluginContext, taskRef: TaskRef) =>
    (await readTask(context, taskRef))?.title ?? "";
  const seriesOf = async (context: PluginContext, taskRef: TaskRef) => {
    const series = (await readTask(context, taskRef))?.recurrence?.at(-1)?.seriesId;
    if (!series) throw new Error("该待办不是周期任务");
    return series;
  };
  return {
    async query(context, entity: DataEntity, query) {
      const page = await bound(context).queryPluginData(databaseName, entity, query);
      return { items: page.items.map(toEntity), ...(page.cursor ? { cursor: page.cursor } : {}) };
    },
    async create(context, entity, input) {
      const record = await bound(context).createPluginData(
        databaseName,
        context.pluginId,
        entity,
        input
      );
      if (entity === "article") refreshArticles();
      return toEntity(record);
    },
    async update(context, entity, id, patch, expectedRevision) {
      const record = await mapConflict(() =>
        bound(context).updatePluginData(
          databaseName,
          context.pluginId,
          entity,
          requireId(id),
          patch,
          expectedRevision
        )
      );
      if (entity === "article") refreshArticles();
      return toEntity(record);
    },
    async remove(context, entity, id, expectedRevision) {
      const numeric = requireId(id);
      await mapConflict(() =>
        bound(context).deletePluginData(
          databaseName,
          context.pluginId,
          entity,
          numeric,
          expectedRevision
        )
      );
      if (entity === "card")
        defaultCardEventBus
          .createEditor()
          .publishCardEvent("card:deleted", { id: numeric } as ICard);
      else refreshArticles();
    },
    async contentOwners(context, ref) {
      const decoded = decodeContentRef(ref);
      if (!decoded) return { owners: [], own: false };
      const record = await bound(context).readPluginContent(
        databaseName,
        decoded.contentId,
        decoded.createdAt,
        "nodes"
      );
      return {
        owners: record?.owners ?? [],
        own: Boolean(record?.pluginOwners.some(owner => owner.pluginId === context.pluginId)),
      };
    },
    async editContent(context, ref, edit, expectedRevision) {
      const decoded = decodeContentRef(ref);
      if (!decoded) throw new Error("正文引用无效");
      return mapConflict(() =>
        bound(context).editPluginContent(
          databaseName,
          context.pluginId,
          decoded.contentId,
          decoded.createdAt,
          edit,
          expectedRevision
        )
      );
    },
    async writeTodo(context, write: TodoWrite) {
      if (write.action === "create") {
        const result = await taskWrite(context, "create_todo", {
          title: write.input.title,
          ...(write.input.dueAt !== undefined ? { dueAt: write.input.dueAt } : {}),
        });
        return toTodo(result as AssistantTask);
      }
      const { taskRef, occurrenceDate } = parseTodoId(write.id);
      const target = { taskRef, revision: write.expectedRevision };
      if (write.action === "update") {
        const patch = { ...write.patch };
        return toTodo(
          (await taskWrite(context, "update_todo", { ...target, patch })) as AssistantTask
        );
      }
      if (write.action === "complete") {
        const occurrence = occurrenceDate
          ? { occurrence: { seriesId: await seriesOf(context, taskRef), occurrenceDate } }
          : {};
        return toTodo(
          (await taskWrite(context, "set_todo_completed", {
            ...target,
            completed: write.completed,
            ...occurrence,
          })) as AssistantTask
        );
      }
      const title = await todoTitle(context, taskRef);
      const receipt = await taskReceipt(context, "delete_todo", { ...target, children: "reject" });
      if (receipt.operationId)
        await bound(context).recordPluginOperation(databaseName, {
          pluginId: context.pluginId,
          entity: "todo",
          entityId: write.id,
          title,
          operationId: receipt.operationId,
        });
      return null;
    },
    async writeCalendar(context, write: CalendarWrite) {
      const calendarId = (value: string | undefined) =>
        value === undefined ? {} : { calendarId: requireId(value) };
      if (write.action === "create") {
        const { calendarId: target, ...input } = write.input;
        return toEvent(
          (await taskWrite(context, "create_calendar_event", {
            ...input,
            ...calendarId(target),
          })) as AssistantCalendarEvent
        );
      }
      const event = { ...parseEventId(write.id), revision: write.expectedRevision };
      if (write.action === "update") {
        const { calendarId: target, ...patch } = write.patch;
        return toEvent(
          (await taskWrite(context, "update_calendar_event", {
            ...event,
            patch: { ...patch, ...calendarId(target) },
          })) as AssistantCalendarEvent
        );
      }
      const receipt = await taskReceipt(context, "delete_calendar_event", event);
      const deleted = (receipt.result as { deleted?: { title?: string } } | undefined)?.deleted;
      if (receipt.operationId)
        await bound(context).recordPluginOperation(databaseName, {
          pluginId: context.pluginId,
          entity: "event",
          entityId: write.id,
          title: deleted?.title ?? "",
          operationId: receipt.operationId,
        });
      return null;
    },
    operations: pluginId =>
      bindDatabaseCommands(dataCommands, { databaseName }).listPluginOperations(
        databaseName,
        pluginId
      ),
    async restore(operation) {
      const commands = bindDatabaseCommands(
        { ...dataCommands, taskAssistantRequest },
        { databaseName }
      );
      if (operation.operationId) {
        const receipt = await runTaskWrite(
          commands.taskAssistantRequest,
          "undo_task_operation",
          { operationId: operation.operationId },
          "plugin-details"
        );
        if (receipt.status === "failed") throw new Error(receipt.error?.message ?? "恢复失败");
        await commands.markPluginOperationRestored(databaseName, operation.id);
        return;
      }
      const restored = await commands.restorePluginOperation(databaseName, operation.id);
      if (restored.entity === "article") refreshArticles();
      if (restored.entity === "plugin-entity") invalidatePluginEntityAppearance();
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
        own: record.pluginOwners.some(owner => owner.pluginId === context.pluginId),
        snapshot: {
          ref,
          revision: record.revision,
          ...(record.markdown !== undefined ? { markdown: record.markdown } : {}),
          ...(record.nodes !== undefined ? { nodes: record.nodes } : {}),
          wordCount: record.wordCount,
          updatedAt: record.updatedAt,
        },
      };
    },
  };
}

function requireId(id: string): number {
  const numeric = parseId(id);
  if (numeric === null) throw new Error("ID 无效");
  return numeric;
}

/** 文章列表只按查询失效刷新（没有逐条合并），插件写入后整域失效，与文章页自身的写入一致 */
function refreshArticles() {
  void queryClient.invalidateQueries({ queryKey: ["articles"] });
}

/** 助理协议：先预检（补全与校验），再逐项写入；conversationKey 记录发起方 */
async function runTaskWrite(
  request: typeof taskAssistantRequest,
  name: string,
  item: Record<string, unknown>,
  conversationKey: string,
  signal?: AbortSignal
): Promise<TaskOperationResult> {
  const input = { requestId: crypto.randomUUID(), ...item };
  const [prepared] = await request<Array<Record<string, unknown>>>(
    "task-assistant:preflight",
    [name, [input]],
    undefined,
    signal
  );
  return request<TaskOperationResult>(
    "task-assistant:write",
    [name, prepared, crypto.randomUUID(), conversationKey],
    undefined,
    signal
  );
}
