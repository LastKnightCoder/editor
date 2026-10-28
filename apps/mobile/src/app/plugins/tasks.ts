import { invoke } from "@tauri-apps/api/core";
import type { DataAdapter, TodoWrite, CalendarWrite } from "@tau/plugins/host";
import {
  PluginConflictError,
  type PluginContext,
  type PluginPermission,
  type PluginTodo,
} from "@tau/plugins";
import type { Descendant } from "slate";
import type { DocumentOperationRequest, ContentNode } from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type { ContentDetailResponse } from "../../types";
import { mobileContentMetrics, mobileContentPlugins } from "./content";
import { getMobileContentKit } from "../../services/editorKit";
import { prepareContentWrite } from "../../services/contentWriteCoordinator";
import { publishContentUpdate } from "../../features/cards/contentSyncBus";
import {
  readPluginSharedContent,
  writePluginSharedContent,
} from "../../services/pluginContentSession";
import { collaborationManager } from "../../features/collaboration/core/manager";
import { request } from "../../features/collaboration/core/rest";

type TaskBody = { task: PluginTodo; document: ContentDetailResponse; binding: string | null };
type Prepared = {
  before: TaskBody;
  nodes: Descendant[];
  contracts: ContentContractDictionary;
  task: PluginTodo | null;
};
type StoredOperation = {
  id: number;
  pending: boolean;
  restoring?: boolean;
  payload: {
    documentTask: {
      binding: string | null;
      before: ContentDetailResponse;
      afterNodes: Descendant[];
      afterContracts: ContentContractDictionary;
      afterRevision: string;
      timeZone?: string;
      remoteOperation: string;
      remoteRequest: DocumentOperationRequest;
      restoreRemote?: { operationId: string; request: DocumentOperationRequest };
    };
    operationId: string;
  };
};
const findTask = (nodes: Descendant[], id: string): Record<string, unknown> | undefined => {
  for (const node of nodes as unknown as Record<string, unknown>[]) {
    if (node.type === "check-list-item" && node.taskId === id) return node;
    if (Array.isArray(node.children)) {
      const found = findTask(node.children as Descendant[], id);
      if (found) return found;
    }
  }
};
export function createMobileTasks(
  database: string,
  token: string,
  changed: () => void,
  checkPermission?: (context: PluginContext, permission: PluginPermission) => Promise<void>
) {
  let disposed = false;
  const activeOperations = new Set<number>();
  const assert = (context?: PluginContext) => {
    if (disposed) throw new Error("插件任务会话已结束");
    context?.signal.throwIfAborted();
  };
  const call = async <T>(
    command: "plugin_tasks_read" | "plugin_tasks_write",
    pluginId: string,
    request: Record<string, unknown>,
    context?: PluginContext
  ): Promise<T> => {
    assert(context);
    try {
      const value = await invoke<T>(command, {
        token,
        database,
        pluginId,
        request,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      assert(context);
      return value;
    } catch (error) {
      if (/PLUGIN_CONFLICT:|CONTENT_VERSION_CONFLICT/.test(String(error)))
        throw new PluginConflictError(String(error));
      throw error;
    }
  };
  const authorize = async (context: PluginContext, permission: PluginPermission) => {
    assert(context);
    await checkPermission?.(context, permission);
    assert(context);
  };
  const publish = (document: ContentDetailResponse, pluginId: string) =>
    publishContentUpdate({
      contentId: document.contentId,
      content: document.content,
      sourceId: `plugin-task:${pluginId}`,
      document,
    });
  const read = (context: PluginContext, id: string) =>
    call<TaskBody>("plugin_tasks_read", context.pluginId, { method: "document", id }, context);
  const writeDocument = async (
    context: PluginContext,
    write: Exclude<TodoWrite, { action: "create" }>
  ) => {
    let source = await read(context, write.id);
    const permission = write.action === "delete" ? "todos:delete" : "todos:write";
    let clean: () => void = () => undefined;
    let shared: Awaited<ReturnType<typeof readPluginSharedContent>> | undefined;
    if (source.binding) shared = await readPluginSharedContent(source.binding);
    else {
      if (!source.document.librarySourceId || !source.document.documentId)
        throw new Error("正文身份缺失");
      clean = await prepareContentWrite(
        source.document.librarySourceId,
        source.document.documentId
      );
      source = await read(context, write.id);
    }
    const taskId = write.id
      .split(":")
      .slice(3)
      .join(":")
      .replace(/@\d{4}-\d{2}-\d{2}$/, "");
    const nodes = (shared?.nodes ?? source.document.content) as Descendant[];
    const target = findTask(nodes, taskId);
    const catalog = await mobileContentPlugins.prepareEditorContracts(
      getMobileContentKit().extensions
    );
    if (!target || catalog.resolve(target)?.access !== "edit")
      throw new Error("该正文待办版本不支持修改，原数据已保留");
    const body = shared ? { nodes: shared.nodes, contracts: shared.contracts } : undefined;
    const prepared = await call<Prepared>(
      "plugin_tasks_read",
      context.pluginId,
      { method: "prepare", write: { ...write, ...(body ? { body } : {}) } },
      context
    );
    let resultNodes = prepared.nodes;
    let contracts = prepared.contracts;
    if (!resultNodes.length) {
      const empty = await catalog.createDocument([
        { type: "paragraph", children: [{ type: "formatted", text: "" }] },
      ]);
      resultNodes = empty.content;
      contracts = { ...contracts, ...empty.contracts };
    }
    await authorize(context, permission);
    clean();
    if (source.binding && shared) {
      const binding = source.binding;
      const origin: {
        database: string;
        token: string;
        pluginId: string;
        taskOperationId?: number;
        timeZone?: string;
      } = {
        database,
        token,
        pluginId: context.pluginId,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      try {
        await writePluginSharedContent(
          binding,
          resultNodes as ContentNode[],
          contracts,
          shared.revision,
          async () => {
            await authorize(context, permission);
            await call(
              "plugin_tasks_read",
              context.pluginId,
              { method: "document", id: write.id },
              context
            );
          },
          origin,
          write.action === "delete"
            ? async candidate => {
                const operation = await call<{ id: number }>(
                  "plugin_tasks_write",
                  context.pluginId,
                  {
                    method: "document-stage",
                    write: {
                      ...write,
                      body,
                      nodes: candidate.nodes,
                      contracts,
                      afterRevision: candidate.revision,
                      remoteOperation: candidate.operationId,
                      remoteRequest: candidate.request,
                    },
                  },
                  context
                );
                origin.taskOperationId = operation.id;
                activeOperations.add(operation.id);
              }
            : undefined
        );
      } catch (error) {
        if (origin.taskOperationId) {
          activeOperations.delete(origin.taskOperationId);
          const stored = await operation(context.pluginId, origin.taskOperationId).catch(
            () => null
          );
          if (stored) await confirm(context.pluginId, stored).catch(() => undefined);
        }
        throw error;
      } finally {
        if (origin.taskOperationId) activeOperations.delete(origin.taskOperationId);
      }
      assert(context);
      changed();
      return write.action === "delete" ? null : (await read(context, write.id)).task;
    }
    const result = await call<{ task: PluginTodo | null; document: ContentDetailResponse }>(
      "plugin_tasks_write",
      context.pluginId,
      {
        method: "todos",
        write: {
          ...write,
          nodes: resultNodes,
          contracts,
          count: mobileContentMetrics.count(resultNodes),
          documentRevision: prepared.before.document.revision,
        },
      },
      context
    );
    publish(result.document, context.pluginId);
    changed();
    return result.task;
  };
  const operation = (pluginId: string, id: number) =>
    call<StoredOperation | null>("plugin_tasks_read", pluginId, { method: "operation", id });
  const confirm = async (pluginId: string, stored: StoredOperation) => {
    const saved = stored.payload.documentTask;
    if (!saved.binding) throw new Error("该操作不属于共享正文");
    await collaborationManager.openDocument(saved.binding);
    const session = collaborationManager.session(saved.binding);
    if (!session) throw new Error("共享会话尚未就绪");
    const remote = stored.restoring
      ? saved.restoreRemote
      : { operationId: saved.remoteOperation, request: saved.remoteRequest };
    if (!remote) throw new Error("共享恢复缺少提交指纹");
    const path = `/v1/documents/${saved.binding}/operations/${remote.operationId}`;
    let response = await request<{ operation: { state: string } | null }>({
      serverUrl: session.info.serverUrl,
      path,
    });
    if (!response.operation || response.operation.state === "PENDING")
      response = await request({
        serverUrl: session.info.serverUrl,
        path: `${path}/cancel`,
        method: "POST",
        body: remote.request,
      });
    assert();
    if (response.operation?.state === "COMMITTED") {
      await collaborationManager.project(saved.binding, {
        database,
        token,
        pluginId,
        timeZone: saved.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(stored.restoring ? { taskRestoreId: stored.id } : { taskOperationId: stored.id }),
      });
      return "committed" as const;
    } else if (response.operation?.state === "ABORTED" || response.operation?.state === "EXPIRED") {
      await call("plugin_tasks_write", pluginId, { method: "cancel-shared", id: stored.id });
      return "cancelled" as const;
    } else throw new Error("共享操作尚未确认，恢复材料已保留");
  };
  return {
    dispose() {
      disposed = true;
    },
    todos: ((context, query) =>
      call(
        "plugin_tasks_read",
        context.pluginId,
        { method: "todos", query },
        context
      )) as DataAdapter["todos"],
    calendar: ((context, query) =>
      call(
        "plugin_tasks_read",
        context.pluginId,
        { method: "calendar", query },
        context
      )) as DataAdapter["calendar"],
    async writeTodo(context: PluginContext, write: TodoWrite) {
      if (write.action !== "create" && write.id.startsWith("document:"))
        return writeDocument(context, write);
      await authorize(context, write.action === "delete" ? "todos:delete" : "todos:write");
      const value = await call<PluginTodo | null>(
        "plugin_tasks_write",
        context.pluginId,
        { method: "todos", write },
        context
      );
      changed();
      return value;
    },
    writeCalendar: (async (context: PluginContext, write: CalendarWrite) => {
      await authorize(context, write.action === "delete" ? "calendar:delete" : "calendar:write");
      const value = await call(
        "plugin_tasks_write",
        context.pluginId,
        { method: "calendar", write },
        context
      );
      changed();
      return value;
    }) as DataAdapter["writeCalendar"],
    async recoverPending(pluginId: string) {
      const pending = await call<StoredOperation[]>("plugin_tasks_read", pluginId, {
        method: "pending",
      });
      const waiting = pending.filter(stored => !activeOperations.has(stored.id));
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, waiting.length) }, async () => {
          while (next < waiting.length) {
            const stored = waiting[next++];
            await confirm(pluginId, stored).catch(() => undefined);
          }
        })
      );
    },
    async restoreDocument(pluginId: string, id: number) {
      let stored = await operation(pluginId, id);
      if (!stored) return false;
      if (!stored.payload.documentTask.binding) {
        const saved = stored.payload.documentTask.before;
        if (!saved.librarySourceId || !saved.documentId) throw new Error("恢复正文身份缺失");
        const clean = await prepareContentWrite(saved.librarySourceId, saved.documentId);
        clean();
        assert();
        const result = await call<{ document: ContentDetailResponse }>(
          "plugin_tasks_write",
          pluginId,
          { method: "restore", id }
        );
        if (result.document) publish(result.document, pluginId);
        changed();
        return true;
      }
      if (stored.pending) {
        const restoring = stored.restoring;
        const outcome = await confirm(pluginId, stored);
        if (restoring) {
          if (outcome !== "committed") throw new Error("共享恢复未提交，删除记录仍可重试恢复");
          changed();
          return true;
        }
        stored = await operation(pluginId, id);
        if (!stored) throw new Error("删除未提交，无需恢复");
      }
      const saved = stored.payload.documentTask;
      if (!saved.binding) throw new Error("共享正文身份缺失");
      const current = await readPluginSharedContent(saved.binding);
      if (current.revision !== saved.afterRevision)
        throw new PluginConflictError("共享删除后正文已有变化，未覆盖");
      const keep = new Set<string>();
      const visit = (nodes: Descendant[], collect: boolean): Descendant[] =>
        (nodes as unknown as Record<string, unknown>[]).map(node => {
          if (!Array.isArray(node.children)) return { ...node } as unknown as Descendant;
          if (collect && typeof node.collabId === "string") keep.add(node.collabId);
          return {
            ...node,
            collabId:
              !collect && !keep.has(String(node.collabId)) ? crypto.randomUUID() : node.collabId,
            children: visit(node.children as Descendant[], collect),
          } as unknown as Descendant;
        });
      visit(current.nodes as Descendant[], true);
      const nodes = visit(saved.before.content, false);
      activeOperations.add(id);
      try {
        await writePluginSharedContent(
          saved.binding,
          nodes as ContentNode[],
          saved.before.contracts ?? {},
          current.revision,
          async () => {
            assert();
            await operation(pluginId, id);
          },
          {
            database,
            token,
            pluginId,
            taskRestoreId: id,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          async candidate => {
            await call("plugin_tasks_write", pluginId, {
              method: "restore-stage",
              id,
              remote: { operationId: candidate.operationId, request: candidate.request },
            });
          }
        );
      } finally {
        activeOperations.delete(id);
      }
      changed();
      return true;
    },
  };
}
