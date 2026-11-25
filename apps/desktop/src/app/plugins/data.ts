import { parseTaskKey } from "@tau/shared/task-assistant";
import type { TodoRecurrenceWrite } from "@tau/plugins/host";
import type {
  CalendarWrite,
  DataAdapter,
  DataEntity,
  ReadableEntity,
  TodoWrite,
} from "@tau/plugins/host";
import {
  PluginConflictError,
  type PluginArticle,
  type PluginCalendarEvent,
  type PluginCard,
  type PluginContentEdit,
  type PluginContentInput,
  type PluginContext,
  type PluginDocument,
  type PluginProject,
  type PluginProjectNode,
  type PluginWhiteboard,
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
import type { Descendant } from "slate";
import * as dataCommands from "@/commands/plugin-data";
import { taskAssistantRequest } from "@/commands/task-assistant";
import { bindDatabaseCommands } from "@/services/command-context";
import { queryClient } from "@/queryClient";
import { invalidatePluginEntityAppearance } from "@/services/plugin-entity-kinds";
import { defaultCardEventBus } from "@/utils/event-bus/card-event-bus";
import type { ICard } from "@/types";
import type {
  PluginContentEdit as PluginContentEditRequest,
  PluginContentSource,
  PluginDataCreateInput,
  PluginDataRecord,
  PluginOperationRecord,
  PluginProjectNodeRecord,
  PluginReadonlyEntity,
} from "@/types/plugin-data";

import { encodeContentRef, decodeContentRef } from "@/utils/plugin-content-ref";

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

/** 正文输入转成 IPC 形式：copyOf、shareOf 的 ContentRef 在这里解码，主进程只认数字身份 */
export function toContentSource(input: PluginContentInput): PluginContentSource {
  if ("copyOf" in input) {
    const decoded = decodeContentRef(input.copyOf);
    if (!decoded) throw new Error("copyOf 正文引用无效");
    return { copyOf: decoded };
  }
  if ("shareOf" in input) {
    const decoded = decodeContentRef(input.shareOf);
    if (!decoded) throw new Error("shareOf 正文引用无效");
    return { shareOf: decoded };
  }
  return input;
}

function toEditRequest(edit: PluginContentEdit): PluginContentEditRequest {
  return edit.op === "replaceText" ? edit : { op: edit.op, content: toContentSource(edit.content) };
}

/** 待办 ID 即 taskKey（周期实例另带 @日期），反向解析为助理协议的 TaskRef */
function parseTodoId(id: string): {
  taskRef: TaskRef;
  occurrenceDate?: string;
} {
  const target = parseTaskKey(id);
  if (!target) throw new Error("待办 ID 无效");
  return target;
}

function parseEventId(id: string): { eventId: number; createdAt: number } {
  const match = /^(\d+):(\d+)$/.exec(id.split("@")[0]);
  if (!match) throw new Error("日程 ID 无效");
  return { eventId: Number(match[1]), createdAt: Number(match[2]) };
}

function toEntity(
  record: PluginDataRecord
): PluginCard | PluginArticle | PluginDocument | PluginWhiteboard | PluginProject {
  const contentRef =
    record.contentId !== null && record.contentCreatedAt !== null
      ? encodeContentRef(record.contentId, record.contentCreatedAt)
      : null;
  const times = { createdAt: record.createdAt, updatedAt: record.updatedAt };
  if (record.entity === "whiteboard")
    return {
      id: String(record.id),
      revision: record.revision,
      title: record.title,
      description: record.description ?? "",
      tags: record.tags,
      pageCount: record.pageCount ?? 0,
      ...times,
    };
  if (record.entity === "project")
    return {
      id: String(record.id),
      revision: record.revision,
      title: record.title,
      archived: record.archived ?? false,
      pinned: record.pinned,
      documentCount: record.documentCount ?? 0,
      ...times,
    };
  const base = {
    id: String(record.id),
    revision: record.revision,
    title: record.title,
    tags: record.tags,
    wordCount: record.wordCount,
    ...times,
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
    listId: task.groupId === null ? null : String(task.groupId),
    reminders:
      task.taskRef.kind === "document"
        ? !task.reminderAt
          ? []
          : task.recurrence?.length
            ? [
                {
                  offsetMs: -(
                    new Date(task.reminderAt).getHours() * 3600000 +
                    new Date(task.reminderAt).getMinutes() * 60000 +
                    new Date(task.reminderAt).getSeconds() * 1000 +
                    new Date(task.reminderAt).getMilliseconds()
                  ),
                },
              ]
            : [{ at: task.reminderAt }]
        : (task.reminderOffsets ?? []).map(offsetMs => ({ offsetMs })),
    recurrence: task.recurrence?.length ? { segments: task.recurrence } : null,
    writable: task.writable,
    ...(task.readonlyReason ? { readonlyReason: task.readonlyReason } : {}),
    ...(task.occurrence
      ? {
          occurrence: {
            taskId: taskKey(task.taskRef),
            seriesId: task.occurrence.seriesId,
            originalDate: task.occurrence.occurrenceDate,
            state: task.occurrenceState ?? {},
          },
        }
      : {}),
    title: task.title,
    completed:
      (task.isSeries ?? !!task.recurrence?.length) && !task.occurrence ? false : task.completed,
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
    reminders: (event.reminderOffsets ?? []).map(offsetMs => ({ offsetMs })),
    notesRef: event.notes ? encodeContentRef(event.notes.contentId, event.notes.createdAt) : null,
    kind: event.eventId < 0 ? "virtual" : event.taskRef ? "todo-schedule" : "event",
    writable: event.writable,
    ...(!event.writable ? { readonlyReason: "系统日历或虚拟标记不可写" } : {}),
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
  const getTodo = async (context: PluginContext, id: string) => {
    const target = parseTodoId(id);
    const result = await bound(context).taskAssistantRequest<AssistantTask | null>(
      "task-assistant:read",
      ["get_task_object", { kind: "todo", ...target }],
      databaseName,
      context.signal
    );
    return result ? toTodo(result) : null;
  };
  const writeOccurrence = async (
    context: PluginContext,
    write:
      | Exclude<TodoWrite, { action: "create" }>
      | Extract<TodoRecurrenceWrite, { action: "state" }>
  ) => {
    const target = parseTodoId(write.id);
    if (!target.occurrenceDate) throw new Error("实例操作需要实例身份");
    const current = await getTodo(context, write.id);
    if (!current?.occurrence) throw new Error("周期实例已失效");
    let patch: import("@tau/plugins").PluginTodoOccurrencePatch;
    if (write.action === "state") patch = write.patch;
    else if (write.action === "complete") patch = { completed: write.completed };
    else if (write.action === "delete") patch = { skipped: true };
    else {
      if (Object.keys(write.patch).some(key => key !== "dueAt") || !("dueAt" in write.patch))
        throw new Error("实例仅支持改期，标题和清单跟随系列");
      patch = { scheduledAt: write.patch.dueAt };
    }
    await taskWrite(context, "update_todo_occurrence", {
      taskRef: target.taskRef,
      revision: write.expectedRevision,
      occurrence: {
        seriesId: current.occurrence.seriesId,
        occurrenceDate: current.occurrence.originalDate,
      },
      action: "patch",
      statePatch: patch,
    });
    const saved = await getTodo(context, write.id);
    if (!saved) throw new Error("操作已提交，但待办随后失效，请重新读取");
    return saved;
  };
  const offsets = (reminders: import("@tau/plugins").PluginTodoReminder[]) =>
    reminders.map(value => {
      if (!("offsetMs" in value)) throw new Error("独立待办不支持绝对提醒");
      return value.offsetMs;
    });
  const writeRecurrence = async (
    context: PluginContext,
    write: TodoWrite | TodoRecurrenceWrite
  ) => {
    if (write.action === "state") return writeOccurrence(context, write);
    if (write.action !== "recurrence") return adapter.writeTodo(context, write);
    const target = parseTodoId(write.id);
    if (target.occurrenceDate) throw new Error("重复规则需要根任务身份");
    await taskWrite(context, "set_todo_recurrence", {
      taskRef: target.taskRef,
      revision: write.expectedRevision,
      effectiveDate: write.change.effectiveFrom,
      rule: write.change.rule,
    });
    const saved = await getTodo(context, write.id);
    if (!saved) throw new Error("操作已提交，但待办随后失效，请重新读取");
    return saved;
  };
  const adapter: DesktopDataAdapter = {
    todoRecurrence: {
      write: writeRecurrence,
      states: async (context, query) => {
        const target = parseTodoId(query.taskId);
        if (target.occurrenceDate) throw new Error("实例状态分页需要根任务身份");
        try {
          return await bound(context).taskAssistantRequest(
            "data-occurrence-states:read",
            [
              context.pluginId,
              { taskRef: target.taskRef, limit: query.limit, cursor: query.cursor },
            ],
            databaseName,
            context.signal
          );
        } catch (error) {
          if (
            String(error).includes("VERSION_CONFLICT") ||
            String(error).includes("实例状态已变化")
          )
            throw new PluginConflictError("实例状态已变化，请重新读取");
          throw error;
        }
      },
    },
    writeTodoOccurrence: writeOccurrence,
    readChanges: (context, request) =>
      bound(context).taskAssistantRequest(
        "data-changes:read",
        [context.pluginId, request],
        databaseName,
        context.signal
      ),
    schedule: {
      async get(context, entity, id) {
        const event = entity === "event" ? parseEventId(id) : null;
        const target =
          entity === "todo"
            ? parseTodoId(id)
            : event
              ? { id: event.eventId, createdAt: event.createdAt }
              : { id: requireId(id) };
        const result = await bound(context).taskAssistantRequest<
          | AssistantTask
          | AssistantCalendarEvent
          | import("@tau/plugins").PluginTodoList
          | import("@tau/plugins").PluginCalendar
          | null
        >(
          "task-assistant:read",
          ["get_task_object", { kind: entity, ...target }],
          databaseName,
          context.signal
        );
        if (!result) return null;
        return entity === "todo"
          ? toTodo(result as AssistantTask)
          : entity === "event"
            ? toEvent(result as AssistantCalendarEvent)
            : (result as
                | import("@tau/plugins").PluginTodoList
                | import("@tau/plugins").PluginCalendar);
      },
      async directories(context, entity, { limit, ...query }) {
        return bound(context).taskAssistantRequest(
          "task-assistant:read",
          ["query_task_directories", { kind: entity, ...query, pageSize: limit }],
          databaseName,
          context.signal
        );
      },
    },
    async query(context, entity, query) {
      if (isReadonly(entity))
        return bound(context).queryPluginReadonlyData(databaseName, entity, query);
      const page = await bound(context).queryPluginData(databaseName, entity, query);
      return {
        items: page.items.map(toEntity),
        ...(page.cursor ? { cursor: page.cursor } : {}),
      };
    },
    async create(context, entity, value) {
      const { content, ...fields } = value as PluginDataCreateInput & {
        content?: PluginContentInput;
      };
      const input: PluginDataCreateInput = {
        ...fields,
        ...(content ? { content: toContentSource(content) } : {}),
      };
      const record = await bound(context).createPluginData(
        databaseName,
        context.pluginId,
        entity,
        input
      );
      refreshLists(entity);
      // 插件自己新建的内容与 app.run 新建的一样登记：不需要读取权限也能显示与关联
      await bound(context).grantPluginRefs(databaseName, context.pluginId, [
        { kind: entity, id: String(record.id) },
      ]);
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
      refreshLists(entity);
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
      else refreshLists(entity);
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
          toEditRequest(edit),
          expectedRevision
        )
      );
    },
    async writeTodo(context, write: TodoWrite) {
      if (write.action === "create") {
        const result = await taskWrite(context, "create_todo", {
          title: write.input.title,
          ...(write.input.recurrence ? { recurrence: write.input.recurrence } : {}),
          ...(write.requestId === undefined
            ? {}
            : {
                requestId: await createRequestId(context.pluginId, write.requestId),
                requestHash: write.requestHash,
              }),
          ...(write.input.listId === undefined ? {} : { groupId: requireId(write.input.listId) }),
          ...(write.input.reminders === undefined
            ? {}
            : { reminderOffsets: offsets(write.input.reminders) }),
          ...(write.input.dueAt !== undefined ? { dueAt: write.input.dueAt } : {}),
        });
        return toTodo(result as AssistantTask);
      }
      const { taskRef, occurrenceDate } = parseTodoId(write.id);
      const target = { taskRef, revision: write.expectedRevision };
      if (write.action === "update") {
        const { listId, reminders, ...fields } = write.patch;

        const patch = {
          ...fields,
          ...(listId === undefined ? {} : { groupId: requireId(listId) }),
          ...(reminders === undefined
            ? {}
            : taskRef.kind === "document"
              ? { reminders }
              : { reminderOffsets: offsets(reminders) }),
        };
        return toTodo(
          (await taskWrite(context, "update_todo", {
            ...target,
            patch,
          })) as AssistantTask
        );
      }
      if (write.action === "complete") {
        const occurrence = occurrenceDate
          ? {
              occurrence: {
                seriesId: (await getTodo(context, write.id))?.occurrence?.seriesId,
                occurrenceDate,
              },
            }
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
      const receipt = await taskReceipt(context, "delete_todo", {
        ...target,
        children: "reject",
      });
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
        const { calendarId: target, reminders, notes, ...input } = write.input;
        return toEvent(
          (await taskWrite(context, "create_calendar_event", {
            ...input,
            ...(write.requestId === undefined
              ? {}
              : {
                  requestId: await createRequestId(context.pluginId, write.requestId),
                  requestHash: write.requestHash,
                }),
            ...(reminders === undefined ? {} : { reminderOffsets: offsets(reminders) }),
            ...(notes === undefined ? {} : { notes: toContentSource(notes) }),
            ...calendarId(target),
          })) as AssistantCalendarEvent
        );
      }
      const event = {
        ...parseEventId(write.id),
        revision: write.expectedRevision,
      };
      if (write.action === "notes")
        return toEvent(
          (await taskWrite(context, "update_calendar_event", {
            ...event,
            patch: { ensureNotes: true },
          })) as AssistantCalendarEvent
        );
      if (write.action === "update") {
        const { calendarId: target, reminders, ...patch } = write.patch;
        return toEvent(
          (await taskWrite(context, "update_calendar_event", {
            ...event,
            patch: {
              ...patch,
              ...calendarId(target),
              ...(reminders === undefined ? {} : { reminderOffsets: offsets(reminders) }),
            },
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
      if (restored.entity === "plugin-entity") invalidatePluginEntityAppearance();
      else refreshLists(restored.entity);
    },
    async get(context, entity, id) {
      if (isReadonly(entity)) return bound(context).getPluginReadonlyData(databaseName, entity, id);
      const numeric = parseId(id);
      if (numeric === null) return null;
      const record = await bound(context).getPluginData(databaseName, entity, numeric);
      return record ? toEntity(record) : null;
    },
    async todos(context, { limit, listId, ...query }) {
      if (listId !== undefined && query.source === "document") return { items: [] };
      const result = await tasks<AssistantTask>(context, "query_todos", {
        ...query,
        ...(listId === undefined ? {} : { groupId: requireId(listId), source: "todo" }),
        pageSize: limit,
      });
      return {
        items: result.items.map(toTodo),
        ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
      };
    },
    async calendar(context, { limit, calendarIds, ...query }) {
      const result = await tasks<AssistantCalendarEvent>(context, "query_calendar_events", {
        ...query,
        ...(calendarIds === undefined ? {} : { calendarIds: calendarIds.map(requireId) }),
        pageSize: limit,
      });
      return {
        items: result.items.map(toEvent),
        ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
      };
    },
    async notebookResources(context, notebookId) {
      return bound(context).getPluginNotebookResources(databaseName, requireId(notebookId));
    },
    async projectTree(context, projectId) {
      const nodes = await bound(context).getPluginProjectTree(databaseName, requireId(projectId));
      return nodes && nodes.map(toProjectNode);
    },
    async createDocument(context, { content, projectId, parentId, ...fields }) {
      const record = await bound(context).createPluginDocument(databaseName, context.pluginId, {
        ...fields,
        projectId: requireId(projectId),
        ...(parentId !== undefined ? { parentId: requireId(parentId) } : {}),
        ...(content ? { content: toContentSource(content) } : {}),
      });
      refreshLists("project");
      await bound(context).grantPluginRefs(databaseName, context.pluginId, [
        { kind: "document", id: String(record.id) },
      ]);
      return toEntity(record);
    },
    async moveDocument(context, id, { projectId, from, to, index }, expectedRevision) {
      const result = await mapConflict(() =>
        bound(context).movePluginDocument(
          databaseName,
          context.pluginId,
          requireId(id),
          {
            projectId: requireId(projectId),
            from: from === null ? null : requireId(from),
            to: to === null ? null : requireId(to),
            ...(index !== undefined ? { index } : {}),
          },
          expectedRevision
        )
      );
      refreshLists("project");
      return result;
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
          // 主进程按库中 JSON 原样返回编辑器节点
          ...(record.nodes !== undefined
            ? {
                nodes: record.nodes as Descendant[],
                contracts: record.contracts,
              }
            : {}),
          wordCount: record.wordCount,
          updatedAt: record.updatedAt,
        },
      };
    },
  };
  return adapter;
}

const READONLY_ENTITIES = new Set<ReadableEntity>(["notebook", "material", "chat-session"]);

const isReadonly = (entity: ReadableEntity): entity is PluginReadonlyEntity =>
  READONLY_ENTITIES.has(entity);

function toProjectNode(node: PluginProjectNodeRecord): PluginProjectNode {
  return {
    documentId: String(node.id),
    revision: node.revision,
    title: node.title,
    kind: node.kind,
    ...(node.ref ? { ref: { kind: node.ref.kind, id: String(node.ref.id) } } : {}),
    children: node.children.map(toProjectNode),
  };
}

function requireId(id: string): number {
  const numeric = parseId(id);
  if (numeric === null) throw new Error("ID 无效");
  return numeric;
}

/**
 * 插件写入后按查询失效刷新本窗口。文章列表只按查询失效刷新（没有逐条合并），与文章页自身的写入一致；
 * 白板与项目没有写入广播，其他窗口在聚焦时重拉；项目文档的目录随项目刷新。
 */
const LIST_KEYS: Partial<Record<DataEntity, string>> = {
  article: "articles",
  whiteboard: "whiteboards",
  project: "projects",
  document: "projects",
};

function refreshLists(entity: DataEntity) {
  const key = LIST_KEYS[entity];
  if (key) void queryClient.invalidateQueries({ queryKey: [key] });
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

async function createRequestId(pluginId: string, requestId: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([pluginId, requestId]));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
