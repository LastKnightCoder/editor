import { invoke } from "@tauri-apps/api/core";
import { createElement } from "react";
import {
  PluginConflictError,
  type PluginContext,
  type PluginEntityKind,
  type PluginIcon,
} from "@tau/plugins";
import type {
  EntitiesAdapter,
  RecordsAdapter,
  LinksAdapter,
  TransactionAdapter,
  PluginTransactionOp,
} from "@tau/plugins/host";
import type { MobileDataAdapter } from "./data";

async function iconMarkup(Icon?: PluginIcon) {
  if (!Icon) return "";
  const { renderToStaticMarkup } = await import("react-dom/server");
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(createElement(Icon, { size: 24, strokeWidth: 2 }));
  const svg = template.content.firstElementChild;
  if (
    template.content.childNodes.length !== 1 ||
    svg?.namespaceURI !== "http://www.w3.org/2000/svg"
  )
    throw new Error("类型图标必须是单个 SVG");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!svg.getAttribute("width")) svg.setAttribute("width", "24");
  if (!svg.getAttribute("height")) svg.setAttribute("height", "24");
  if (svg.outerHTML.length > 16 * 1024) throw new Error("类型图标超过 16 KB");
  return svg.outerHTML;
}

export function createMobileOwnData(
  database: string,
  token: string,
  data: MobileDataAdapter,
  changed: () => void,
  canRead: (context: PluginContext, kind: PluginEntityKind) => Promise<boolean>
) {
  let disposed = false;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sessions = new Map<PluginContext, Promise<void>>();
  const leases = new WeakMap<PluginContext, string>();
  const declarations = new Map<PluginContext, Map<string, Promise<unknown>>>();
  const check = (context: PluginContext) => {
    context.signal.throwIfAborted();
    if (disposed || context.workspaceId !== database) throw new Error("插件工作区已失效");
  };
  const raw = async <T>(context: PluginContext, command: string, request: unknown): Promise<T> => {
    check(context);
    let lease = leases.get(context);
    if (!lease) {
      lease = crypto.randomUUID();
      leases.set(context, lease);
    }
    try {
      const result = await invoke<T>(command, {
        database,
        token,
        pluginId: context.pluginId,
        lease,
        request,
        timeZone,
      });
      check(context);
      return result;
    } catch (error) {
      if (/PLUGIN_CONFLICT:|CONTENT_VERSION_CONFLICT/.test(String(error)))
        throw new PluginConflictError(String(error));
      throw error;
    }
  };
  const ready = (context: PluginContext) => {
    check(context);
    let pending = sessions.get(context);
    if (!pending) {
      pending = raw<void>(context, "plugin_own_write", { method: "adopt" });
      sessions.set(context, pending);
      context.signal.addEventListener(
        "abort",
        () => {
          sessions.delete(context);
          declarations.delete(context);
          void invoke("plugin_own_write", {
            database,
            token,
            pluginId: context.pluginId,
            lease: leases.get(context),
            request: { method: "release" },
            timeZone,
          }).catch(() => undefined);
        },
        { once: true }
      );
    }
    return pending;
  };
  const settled = async (context: PluginContext) => {
    await ready(context);
    await Promise.all(declarations.get(context)?.values() ?? []);
    check(context);
  };
  const call = async <T>(
    context: PluginContext,
    request: Record<string, unknown>,
    write = false
  ): Promise<T> => {
    await settled(context);
    const result = await raw<T>(context, write ? "plugin_own_write" : "plugin_own_read", request);
    if (write) changed();
    return result;
  };
  const withReadable = async (
    context: PluginContext,
    op: Extract<PluginTransactionOp, { op: "link.add" }>
  ) => ({
    ...op,
    readable: op.readable && (await canRead(context, op.to.kind)),
  });
  const reserve = (context: PluginContext) => call<string>(context, { method: "reserve" }, true);
  const entities: EntitiesAdapter & Required<Pick<EntitiesAdapter, "registerKind">> = {
    async create(context, input, indexes) {
      const id = await reserve(context);
      const content = await data.prepareContent(context, input.content);
      return call(
        context,
        { method: "entity.create", id, input: { ...input, content: undefined }, indexes, content },
        true
      );
    },
    get: (context, id) => call(context, { method: "entity.get", id }),
    find: (context, kind, key) => call(context, { method: "entity.find", kind, key }),
    query: (context, query) => call(context, { method: "entity.query", query }),
    count: (context, filter) => call(context, { method: "entity.count", filter }),
    backlinks: (context, id) => call(context, { method: "entity.backlinks", id }),
    update: (context, id, patch, expectedRevision, indexes) =>
      call(context, { method: "entity.update", id, patch, expectedRevision, indexes }, true),
    delete: async (context, id, expectedRevision) => {
      await call(context, { method: "entity.delete", id, expectedRevision }, true);
    },
    registerKind(context, definition) {
      check(context);
      let active = true;
      let registered = declarations.get(context);
      if (!registered) {
        registered = new Map();
        declarations.set(context, registered);
      }
      const task = (async () => {
        await ready(context);
        const icon = await iconMarkup(definition.icon);
        check(context);
        if (!active) return;
        await raw(context, "plugin_own_write", {
          method: "entity.registerKind",
          definition: { kind: definition.kind, label: definition.label, icon },
        });
      })();
      registered.set(definition.kind, task);
      void task.catch(error => {
        if (!context.signal.aborted && !disposed) console.warn("插件内容类型登记失败", error);
      });
      return {
        dispose() {
          active = false;
          if (registered.get(definition.kind) === task) registered.delete(definition.kind);
        },
      };
    },
  };
  const records: RecordsAdapter = {
    insert: (context, collection, record, indexes) =>
      call(context, { method: "record.insert", collection, ...record, indexes }, true),
    get: (context, collection, id) => call(context, { method: "record.get", collection, id }),
    query: (context, collection, query) =>
      call(context, { method: "record.query", collection, query }),
    count: (context, collection, where) =>
      call(context, { method: "record.count", collection, where }),
    update: (context, collection, id, record, expectedRevision, indexes) =>
      call(
        context,
        { method: "record.update", collection, id, data: record, expectedRevision, indexes },
        true
      ),
    delete: async (context, collection, id, expectedRevision) => {
      await call(context, { method: "record.delete", collection, id, expectedRevision }, true);
    },
  };
  const links: LinksAdapter = {
    async add(context, link, readable) {
      await settled(context);
      const allowed = readable && (await canRead(context, link.to.kind));
      const result = await raw<Awaited<ReturnType<LinksAdapter["add"]>>>(
        context,
        "plugin_own_write",
        { method: "link.add", ...link, readable: allowed }
      );
      changed();
      return result;
    },
    list: (context, from, role) => call(context, { method: "link.list", from, role }),
    remove: async (context, id) => {
      await call(context, { method: "link.remove", id }, true);
    },
    reorder: async (context, from, ids) => {
      await call(context, { method: "link.reorder", from, ids }, true);
    },
  };
  const transaction: TransactionAdapter = {
    reserveEntityId: reserve,
    async commit(context, ops) {
      await ready(context);
      const prepared = [];
      for (const op of ops) {
        check(context);
        if (op.op === "entity.create") {
          const content = await data.prepareContent(context, op.input.content);
          prepared.push({ ...op, input: { ...op.input, content: undefined }, content });
        } else prepared.push(op);
      }
      const authorized = [];
      await settled(context);
      for (const op of prepared)
        authorized.push(op.op === "link.add" ? await withReadable(context, op) : op);
      await raw(context, "plugin_own_write", { method: "transaction", ops: authorized });
      changed();
    },
  };
  return {
    entities,
    records,
    links,
    transaction,
    ready,
    dispose() {
      disposed = true;
      for (const context of sessions.keys())
        void invoke("plugin_own_write", {
          database,
          token,
          pluginId: context.pluginId,
          lease: leases.get(context),
          request: { method: "release" },
          timeZone,
        }).catch(() => undefined);
      sessions.clear();
      declarations.clear();
    },
  };
}
export type MobileOwnData = ReturnType<typeof createMobileOwnData>;
