import { describe, expect, it } from "vitest";
import {
  definePlugin,
  PluginPermissionError,
  type PluginContext,
  type PluginPermission,
} from "../index";
import {
  createMemoryStorage,
  PluginHost,
  type DataAdapter,
  type EventsAdapter,
  type PermissionsAdapter,
} from "../host";
import type { PluginDomainEvent } from "../events";
import { validatePluginManifest } from "../package";

const card = {
  id: "3",
  title: "卡",
  tags: ["读书"],
  pinned: false,
  contentRef: "7:100",
  wordCount: 2,
  createdAt: 1,
  updatedAt: 2,
};

function setup({
  declared = ["cards:read", "todos:read"] as PluginPermission[],
  granted = new Set<PluginPermission>(),
  owners = ["card" as const],
} = {}) {
  const calls: unknown[][] = [];
  const permissions: PermissionsAdapter = {
    async ensure(_context, plugin, list) {
      calls.push(["ensure", plugin.id, ...list]);
      for (const permission of list)
        if (!granted.has(permission)) throw new PluginPermissionError(permission, "denied");
    },
    query: async (_context, permission) => (granted.has(permission) ? "granted" : "prompt"),
    async request(_context, _plugin, list) {
      calls.push(["request", ...list]);
      return list.every(permission => granted.has(permission));
    },
  };
  const data: DataAdapter = {
    async query(_context, entity, query) {
      calls.push(["query", entity, query]);
      return { items: [card], cursor: "next" };
    },
    get: async (_context, entity, id) => (entity === "card" && id === "3" ? card : null),
    async todos(_context, query) {
      calls.push(["todos", query]);
      return { items: [] };
    },
    calendar: async () => ({ items: [] }),
    readContent: async (_context, ref) => ({
      owners,
      snapshot: { ref, markdown: "正文", wordCount: 2, updatedAt: 2 },
    }),
  };
  const subscribers = new Set<(event: PluginDomainEvent) => void>();
  const events: EventsAdapter = {
    subscribe(_context, listener) {
      subscribers.add(listener);
      return { dispose: () => void subscribers.delete(listener) };
    },
  };
  const emit = (event: PluginDomainEvent) => subscribers.forEach(listener => listener(event));
  let context!: PluginContext;
  const host = new PluginHost({
    workspaceId: "work",
    storage: createMemoryStorage(),
    permissions,
    data,
    events,
  });
  host.registerTrusted({
    ...definePlugin({
      id: "weekly",
      name: "每周回顾",
      version: "1.0.0",
      create: () => ({
        activate(ctx) {
          context = ctx;
        },
      }),
    }),
    permissions: declared,
  });
  return { host, calls, context: () => context, emit, subscribers };
}

describe("插件业务数据与权限", () => {
  it("manifest 声明权限：客户端丢弃未知值，门户严格报错", () => {
    const base = {
      formatVersion: 1,
      id: "weekly",
      name: "每周回顾",
      version: "1.0.0",
      apiVersion: 1,
      platform: "desktop",
      format: "cjs",
      main: "main.js",
      integrity: { "main.js": "a".repeat(64) },
    };
    expect(
      validatePluginManifest({ ...base, permissions: ["cards:read", "cards:write", "cards:read"] })
        .permissions
    ).toEqual(["cards:read"]);
    expect(() =>
      validatePluginManifest({ ...base, permissions: ["cards:write"] }, { strict: true })
    ).toThrow("未知插件权限");
  });

  it("宿主公布插件声明的权限，未声明的调用直接拒绝且不询问", async () => {
    const { host, calls, context } = setup({ declared: ["todos:read"] });
    await host.enable("weekly");
    expect(host.listPlugins()[0].permissions).toEqual(["todos:read"]);
    const error = await context()
      .data.cards.query()
      .catch(cause => cause);
    expect(error).toBeInstanceOf(PluginPermissionError);
    expect(error.reason).toBe("undeclared");
    expect(calls).toEqual([]);
    expect(await context().permissions.query("cards:read")).toBe("denied");
  });

  it("已授权时校验参数、补默认分页并复制结果", async () => {
    const { host, calls, context } = setup({ granted: new Set(["cards:read"]) });
    await host.enable("weekly");
    const page = await context().data.cards.query({ tag: "读书", updatedAfter: 5 });
    expect(calls).toEqual([
      ["ensure", "weekly", "cards:read"],
      ["query", "card", { tag: "读书", updatedAfter: 5, limit: 50 }],
    ]);
    expect(page).toEqual({ items: [card], cursor: "next" });
    expect(page.items[0]).not.toBe(card);
    await expect(context().data.cards.query({ limit: 500 })).rejects.toThrow("limit");
    await expect(context().data.cards.query({ sort: "random" as "created" })).rejects.toThrow(
      "sort"
    );
  });

  it("用户拒绝时数据接口抛出 PluginPermissionError", async () => {
    const { host, context } = setup();
    await host.enable("weekly");
    await expect(context().data.todos.query()).rejects.toMatchObject({
      name: "PluginPermissionError",
      reason: "denied",
      permission: "todos:read",
    });
  });

  it("读取正文需要任一所属实体的读取权限；无所属实体视为不存在", async () => {
    const granted = setup({ granted: new Set(["cards:read"]) });
    await granted.host.enable("weekly");
    expect(await granted.context().content.read("7:100")).toMatchObject({ markdown: "正文" });

    const undeclared = setup({ declared: ["todos:read"] });
    await undeclared.host.enable("weekly");
    await expect(undeclared.context().content.read("7:100")).rejects.toMatchObject({
      reason: "undeclared",
      permission: "cards:read",
    });

    const orphan = setup({ owners: [] as never[], granted: new Set(["cards:read"]) });
    await orphan.host.enable("weekly");
    expect(await orphan.context().content.read("7:100")).toBeNull();
  });

  it("request 只接受已声明的权限并去重", async () => {
    const { host, calls, context } = setup({ granted: new Set(["cards:read"]) });
    await host.enable("weekly");
    expect(await context().permissions.request(["cards:read", "cards:read"])).toBe(true);
    expect(calls).toEqual([["request", "cards:read"]]);
    await expect(context().permissions.request(["documents:read"])).rejects.toMatchObject({
      reason: "undeclared",
    });
  });

  it("停用后的上下文不能再读取", async () => {
    const { host, context } = setup({ granted: new Set(["cards:read"]) });
    await host.enable("weekly");
    const stale = context();
    await host.disable("weekly");
    await expect(stale.data.cards.get("3")).rejects.toThrow("插件实例已失效");
  });

  it("事件按类型与读取权限送达，停用后退订", async () => {
    const { host, context, emit, subscribers } = setup({ granted: new Set(["cards:read"]) });
    await host.enable("weekly");
    const received: string[] = [];
    context().events.on(["card.updated", "todos.changed", "workspace.reset"], event =>
      received.push(`${event.type}:${event.id ?? ""}`)
    );
    emit({ type: "card.updated", id: "3", at: 1 });
    emit({ type: "card.deleted", id: "3", at: 1 });
    emit({ type: "todos.changed", at: 1 });
    emit({ type: "workspace.reset", at: 1 });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(received).toEqual(["card.updated:3", "workspace.reset:"]);
    await host.disable("weekly");
    expect(subscribers.size).toBe(0);
  });

  it("订阅未声明权限的事件或未知类型直接报错", async () => {
    const { host, context } = setup({ declared: ["todos:read"] });
    await host.enable("weekly");
    expect(() => context().events.on("card.updated", () => undefined)).toThrow(
      PluginPermissionError
    );
    expect(() => context().events.on("card.moved" as "card.updated", () => undefined)).toThrow(
      "未知的事件类型"
    );
  });
});
