import { createMobileTasks } from "./tasks";
import {
  readPluginSharedContent,
  writePluginSharedContent,
} from "../../services/pluginContentSession";
import type { ContentNode } from "@tau/collaboration";
import { invoke } from "@tauri-apps/api/core";
import type { Descendant } from "slate";
import type { DataAdapter } from "@tau/plugins/host";
import {
  PluginConflictError,
  type PluginContext,
  type PluginContentInput,
  type PluginContentEdit,
  type PluginProjectNode,
  type PluginPermission,
} from "@tau/plugins";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type { ContentDetailResponse } from "../../types";
import { mobileImportFromMarkdown, mobileMarkdown } from "../../services/editorMarkdown";
import { getMobileContentKit } from "../../services/editorKit";
import { mobileContentMetrics, mobileContentPlugins } from "./content";
import { publishContentUpdate } from "../../features/cards/contentSyncBus";
import { prepareContentWrite } from "../../services/contentWriteCoordinator";

export interface MobileContentSnapshot {
  owners: ("card" | "article" | "document")[];
  own: boolean;
  addressable?: boolean;
  document: ContentDetailResponse;
  binding: string | null;
}
export type MobileComponentAccess =
  | { status: "missing" | "denied" }
  | { status: "prompt"; permission: PluginPermission }
  | { status: "granted"; snapshot: MobileContentSnapshot };
export interface PluginOperation {
  id: number;
  entity: "card" | "article" | "project" | "document" | "todo" | "event" | "plugin-entity";
  pending?: boolean;
  entityId: string;
  title: string;
  createdAt: number;
  restoredAt: number | null;
}
export interface MobileDataAdapter extends DataAdapter {
  resolveComponentContent(
    context: PluginContext,
    ref: string,
    mode: "read" | "write"
  ): Promise<MobileComponentAccess>;
  saveComponentContent(
    context: PluginContext,
    ref: string,
    nodes: Descendant[],
    contracts: ContentContractDictionary,
    expectedRevision: string
  ): Promise<ContentDetailResponse>;
  projectComponentContent(
    context: PluginContext,
    ref: string,
    viewGuard?: () => void
  ): Promise<void>;
  prepareContent(
    context: PluginContext,
    input?: PluginContentInput
  ): Promise<{
    nodes: Descendant[];
    contracts: ContentContractDictionary;
    count: number;
  }>;
  dispose(): void;
  operations(pluginId: string): Promise<PluginOperation[]>;
  restore(pluginId: string, id: number): Promise<void>;
}
const unavailable = async (): Promise<never> => {
  throw new Error("当前移动宿主尚未提供此业务接口");
};
const permissionDomains = {
  card: "cards",
  article: "articles",
  project: "projects",
  document: "documents",
} as const;
const empty: Descendant[] = [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];

export function createMobileData(
  database: string,
  token: string,
  changed: () => void,
  checkPermission?: (context: PluginContext, permission: PluginPermission) => Promise<void>,
  prepareOwn?: (context: PluginContext) => Promise<void>
): MobileDataAdapter {
  const tasks = createMobileTasks(database, token, changed, checkPermission);
  let closed = false;
  const check = (context?: PluginContext) => {
    if (closed) throw new Error("插件数据会话已结束");
    context?.signal.throwIfAborted();
  };
  const call = async <T>(
    command: string,
    pluginId: string,
    args: Record<string, unknown>,
    context?: PluginContext
  ): Promise<T> => {
    check(context);
    try {
      const result = await invoke<T>(command, { database, token, pluginId, ...args });
      check(context);
      return result;
    } catch (error) {
      if (/PLUGIN_CONFLICT:|CONTENT_VERSION_CONFLICT/.test(String(error)))
        throw new PluginConflictError(String(error));
      throw error;
    }
  };
  const read = (context: PluginContext, request: Record<string, unknown>) =>
    call<unknown>("plugin_data_read", context.pluginId, { request }, context);
  const snapshot = async (context: PluginContext, ref: string) => {
    await prepareOwn?.(context);
    const value = (await read(context, { method: "content", ref })) as MobileContentSnapshot | null;
    if (value?.binding) {
      const shared = await readPluginSharedContent(value.binding);
      check(context);
      value.document = {
        ...value.document,
        content: shared.nodes as Descendant[],
        contracts: shared.contracts,
        revision: shared.revision,
        count: mobileContentMetrics.count(shared.nodes),
      };
    }
    return value;
  };
  const write = async <T>(context: PluginContext, request: Record<string, unknown>): Promise<T> => {
    if (
      checkPermission &&
      typeof request.entity === "string" &&
      Object.hasOwn(permissionDomains, request.entity)
    ) {
      const domain = permissionDomains[request.entity as keyof typeof permissionDomains];
      await checkPermission(
        context,
        `${domain}:${request.method === "delete" ? "delete" : "write"}`
      );
    }
    const payload =
      request.method === "content"
        ? { ...request, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        : request;
    const result = await call<T>(
      "plugin_data_write",
      context.pluginId,
      { request: payload },
      context
    );
    changed();
    return result;
  };
  const prepare = async (context: PluginContext, input?: PluginContentInput) => {
    let nodes: Descendant[] = structuredClone(empty);
    let contracts: ContentContractDictionary | undefined;
    if (input && "shareOf" in input) throw new Error("shareOf 只用于新建卡片、文章或项目文档");
    if (input && "copyOf" in input) {
      const source = await snapshot(context, input.copyOf);
      if (!source || (!source.addressable && !source.own && !source.owners.length))
        throw new Error("要复制的正文不存在");
      nodes = source.document.content as Descendant[];
      contracts = source.document.contracts ?? undefined;
    } else if (input && "nodes" in input) {
      nodes = input.nodes.length ? input.nodes : nodes;
      contracts = input.contracts;
    } else if (input && "markdown" in input && input.markdown.trim())
      nodes = await mobileImportFromMarkdown(input.markdown);
    check(context);
    const catalog = await mobileContentPlugins.prepareEditorContracts(
      getMobileContentKit().extensions
    );
    const value = await catalog.createDocument(nodes, contracts);
    check(context);
    return {
      nodes: value.content,
      contracts: value.contracts,
      count: mobileContentMetrics.count(value.content),
    };
  };
  const prepareNew = async (context: PluginContext, input?: PluginContentInput) => {
    if (input && "shareOf" in input) {
      await prepareOwn?.(context);
      check(context);
      return { shareOf: input.shareOf };
    }
    return prepare(context, input);
  };
  const componentAccess = async (
    context: PluginContext,
    value: MobileContentSnapshot | null,
    mode: "read" | "write"
  ): Promise<MobileComponentAccess> => {
    check(context);
    if (!value) return { status: "missing" };
    if (value.own) return { status: "granted", snapshot: value };
    const permissions = value.owners.map(
      owner => `${permissionDomains[owner]}:${mode}` as PluginPermission
    );
    let prompt: PluginPermission | undefined;
    for (const permission of permissions) {
      const state = await context.permissions.query(permission);
      check(context);
      if (state === "granted") return { status: "granted", snapshot: value };
      if (state === "prompt" && !prompt) prompt = permission;
    }
    return prompt ? { status: "prompt", permission: prompt } : { status: "denied" };
  };
  const resolveComponentContent = async (
    context: PluginContext,
    ref: string,
    mode: "read" | "write"
  ): Promise<MobileComponentAccess> => {
    await prepareOwn?.(context);
    const initial = (await read(context, {
      method: "content",
      ref,
    })) as MobileContentSnapshot | null;
    const access = await componentAccess(context, initial, mode);
    if (access.status !== "granted") return access;
    return componentAccess(context, await snapshot(context, ref), mode);
  };
  const componentWriteTarget = async (context: PluginContext, ref: string) => {
    const access = await resolveComponentContent(context, ref, "write");
    if (access.status !== "granted")
      throw new Error(access.status === "missing" ? "正文不存在" : "插件正文写入授权已失效");
    return access.snapshot;
  };
  const editNodes = async (
    context: PluginContext,
    original: ContentDetailResponse,
    edit: PluginContentEdit
  ) => {
    if (edit.op === "replaceText") {
      const markdown = await mobileMarkdown.getMarkdown(original.content as Descendant[]);
      if (
        !edit.find ||
        markdown.indexOf(edit.find) < 0 ||
        markdown.indexOf(edit.find) !== markdown.lastIndexOf(edit.find)
      )
        throw new Error("待替换文本必须恰好出现一次");
      return prepare(context, { markdown: markdown.replace(edit.find, () => edit.markdown) });
    }
    const next = await prepare(context, edit.content);
    if (edit.op === "replaceAll") return next;
    const nodes =
      edit.op === "append"
        ? [...original.content, ...next.nodes]
        : [...next.nodes, ...original.content];
    return {
      nodes,
      contracts: { ...original.contracts, ...next.contracts },
      count: mobileContentMetrics.count(nodes),
    };
  };
  return {
    resolveComponentContent,
    async saveComponentContent(context, ref, nodes, contracts, expectedRevision) {
      const current = await componentWriteTarget(context, ref);
      if (current.document.revision !== expectedRevision) throw new PluginConflictError();
      const content = await prepare(context, { nodes, contracts });
      const guard = async () => {
        const latest = await componentWriteTarget(context, ref);
        if (latest.binding !== current.binding || latest.document.revision !== expectedRevision)
          throw new PluginConflictError();
      };
      if (current.binding) {
        await writePluginSharedContent(
          current.binding,
          content.nodes as ContentNode[],
          content.contracts,
          expectedRevision,
          guard,
          {
            token,
            database,
            pluginId: context.pluginId,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        );
        check(context);
        const saved = await snapshot(context, ref);
        if (!saved) throw new Error("保存后的正文不存在");
        changed();
        return saved.document;
      }
      await guard();
      const result = await write<MobileContentSnapshot>(context, {
        method: "content",
        ref,
        expectedRevision,
        ...content,
      });
      return result.document;
    },
    async projectComponentContent(context, ref, viewGuard) {
      viewGuard?.();
      const target = await componentWriteTarget(context, ref);
      if (!target.binding) return;
      const { collaborationManager } = await import("../../features/collaboration/core/manager");
      const current = await componentWriteTarget(context, ref);
      if (current.binding !== target.binding) throw new PluginConflictError("协作绑定已变化");
      check(context);
      await collaborationManager.project(
        target.binding,
        {
          token,
          database,
          pluginId: context.pluginId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        async () => {
          viewGuard?.();
          const latest = await componentWriteTarget(context, ref);
          viewGuard?.();
          if (latest.binding !== target.binding) throw new PluginConflictError("协作绑定已变化");
        }
      );
      check(context);
      changed();
    },
    prepareContent: prepare,
    dispose: () => {
      closed = true;
      tasks.dispose();
    },
    query: (context, entity, query) =>
      read(context, { method: "query", entity, query }) as Promise<{
        items: unknown[];
        cursor?: string;
      }>,
    get: (context, entity, id) => read(context, { method: "get", entity, id }),
    async create(context, entity, input) {
      if (entity === "project") return write(context, { method: "create", entity, input });
      if (entity !== "card" && entity !== "article") return unavailable();
      return write(context, {
        method: "create",
        entity,
        input,
        content: await prepareNew(context, "content" in input ? input.content : undefined),
      });
    },
    update: (context, entity, id, patch, expectedRevision) =>
      write(context, { method: "update", entity, id, patch, expectedRevision }),
    remove: (context, entity, id, expectedRevision) =>
      write<void>(context, { method: "delete", entity, id, expectedRevision }),
    async contentOwners(context, ref) {
      const value = await snapshot(context, ref);
      return { owners: value?.owners ?? [], own: value?.own ?? false };
    },
    async readContent(context, ref, format) {
      const value = await snapshot(context, ref);
      if (!value) return null;
      const doc = value.document;
      return {
        owners: value.owners,
        own: value.own,
        snapshot: {
          ref,
          revision: doc.revision ?? "",
          wordCount: doc.count,
          updatedAt: doc.updateTime,
          ...(format === "nodes"
            ? { nodes: doc.content as Descendant[], contracts: doc.contracts ?? undefined }
            : { markdown: await mobileMarkdown.getMarkdown(doc.content as Descendant[]) }),
        },
      };
    },
    async editContent(context, ref, edit, expectedRevision) {
      let current = await snapshot(context, ref);
      if (!current) throw new Error("正文不存在");
      const authorize = async (value: MobileContentSnapshot) => {
        if (!checkPermission || value.own) return;
        const candidates = value.owners.filter(
          owner => owner === "card" || owner === "article" || owner === "document"
        );
        for (const owner of candidates) {
          try {
            await checkPermission(context, `${permissionDomains[owner]}:write`);
            return;
          } catch (error) {
            if (owner === candidates.at(-1)) throw error;
          }
        }
        if (!candidates.length) throw new Error("当前正文没有已开放的写入权限");
      };
      if (current.binding) {
        const sharedCurrent = current;
        if (current.document.revision !== expectedRevision) throw new PluginConflictError();
        const next = await editNodes(context, current.document, edit);
        const revision = await writePluginSharedContent(
          current.binding,
          next.nodes as ContentNode[],
          next.contracts,
          expectedRevision,
          async () => {
            check(context);
            await authorize(sharedCurrent);
            await read(context, { method: "check" });
          },
          {
            token,
            database,
            pluginId: context.pluginId,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        );
        check(context);
        changed();
        return { revision };
      }
      const { librarySourceId, documentId } = current.document;
      if (!librarySourceId || !documentId) throw new Error("正文缺少有效身份");
      const clean = await prepareContentWrite(librarySourceId, documentId);
      current = await snapshot(context, ref);
      if (!current || current.document.revision !== expectedRevision)
        throw new PluginConflictError();
      const next = await editNodes(context, current.document, edit);
      await authorize(current);
      clean();
      check(context);
      const saved = await write<MobileContentSnapshot>(context, {
        method: "content",
        ref,
        expectedRevision,
        ...next,
      });
      publishContentUpdate({
        contentId: saved.document.contentId,
        content: saved.document.content as Descendant[],
        sourceId: `plugin:${context.pluginId}`,
        document: saved.document,
      });
      if (!saved.document.revision) throw new Error("保存结果缺少正文版本");
      return { revision: saved.document.revision };
    },
    todos: tasks.todos,
    calendar: tasks.calendar,
    notebookResources: unavailable,
    writeTodo: tasks.writeTodo,
    writeTodoOccurrence: tasks.writeTodo,
    writeCalendar: tasks.writeCalendar,
    projectTree: (context, projectId) =>
      read(context, { method: "projectTree", projectId }) as Promise<PluginProjectNode[] | null>,
    createDocument: async (context, input) =>
      write(context, {
        method: "create",
        entity: "document",
        input,
        content: await prepareNew(context, input.content),
      }),
    moveDocument: (context, id, move, expectedRevision) =>
      write(context, { method: "move", entity: "document", id, move, expectedRevision }),
    operations: async pluginId => {
      await tasks.recoverPending(pluginId);
      return call("plugin_data_operations", pluginId, { restoreId: null });
    },
    async restore(pluginId, id) {
      if (await tasks.restoreDocument(pluginId, id)) return;
      const result = await call<{ document?: ContentDetailResponse }>(
        "plugin_data_operations",
        pluginId,
        { restoreId: id }
      );
      if (result.document)
        publishContentUpdate({
          contentId: result.document.contentId,
          content: result.document.content,
          sourceId: `plugin-restore:${pluginId}`,
          document: result.document,
        });
      changed();
    },
  };
}
