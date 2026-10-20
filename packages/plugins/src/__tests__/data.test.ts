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
  type AppAdapter,
  type DataAdapter,
  type EntitiesAdapter,
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
  owners = ["card" as const] as "card"[],
  own = false,
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
    async create(_context, entity, input) {
      calls.push(["create", entity, input]);
      return card;
    },
    async update(_context, entity, id, patch, revision) {
      calls.push(["update", entity, id, patch, revision]);
      return card;
    },
    async remove(_context, entity, id, revision) {
      calls.push(["remove", entity, id, revision]);
    },
    async writeTodo(_context, write) {
      calls.push(["writeTodo", write]);
      return null;
    },
    writeCalendar: async () => null,
    contentOwners: async () => ({ owners, own }),
    async editContent(_context, ref, edit, revision) {
      calls.push(["editContent", ref, edit, revision]);
      return { revision: "r2" };
    },
    readContent: async (_context, ref) => ({
      owners,
      own,
      snapshot: { ref, revision: "r1", markdown: "正文", wordCount: 2, updatedAt: 2 },
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
  const app: AppAdapter = {
    async pick(_context, plugin, options) {
      calls.push(["pick", plugin.id, options]);
      return [{ ref: { kind: "card", id: "3" }, title: "卡" }];
    },
    async open(_context, ref) {
      calls.push(["open", ref]);
    },
    async run(_context, plugin, request) {
      calls.push(["run", plugin.id, request]);
    },
  };
  const entity = {
    id: "1",
    kind: "note",
    key: "2026-W43",
    title: "第 43 周",
    contentRef: "9:100",
    meta: {},
    createdAt: 1,
    updatedAt: 1,
    revision: "1",
  };
  const entities: EntitiesAdapter = {
    async create(_context, input) {
      calls.push(["entities.create", input]);
      return { ...entity, ...input };
    },
    get: async (_context, id) => (id === "1" ? entity : null),
    find: async (_context, kind, key) => (kind === "note" && key === entity.key ? entity : null),
    async query(_context, query) {
      calls.push(["entities.query", query]);
      return { items: [entity] };
    },
    async update(_context, id, patch, revision) {
      calls.push(["entities.update", id, patch, revision]);
      return { ...entity, ...patch, revision: "2" };
    },
    async delete(_context, id, revision) {
      calls.push(["entities.delete", id, revision]);
    },
    backlinks: async () => [
      {
        entity: "card",
        id: "3",
        title: "卡",
        snippets: [{ before: "见", label: "周记", after: "" }],
      },
      { entity: "article", id: "5", title: "文章", snippets: [] },
      { entity: null, id: "8", title: "日记", snippets: [] },
    ],
  };
  let context!: PluginContext;
  const host = new PluginHost({
    entities,
    workspaceId: "work",
    storage: createMemoryStorage(),
    permissions,
    data,
    events,
    app,
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
      validatePluginManifest({ ...base, permissions: ["cards:read", "cards:rename", "cards:read"] })
        .permissions
    ).toEqual(["cards:read"]);
    expect(() =>
      validatePluginManifest({ ...base, permissions: ["cards:rename"] }, { strict: true })
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
    emit({ type: "card.updated", id: "3", at: 1, origin: { kind: "app" } });
    emit({ type: "card.deleted", id: "3", at: 1, origin: { kind: "app" } });
    emit({ type: "todos.changed", at: 1, origin: { kind: "app" } });
    emit({ type: "workspace.reset", at: 1, origin: { kind: "app" } });
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

  it("写入需要写入或删除权限并校验参数与 revision", async () => {
    const granted = new Set<PluginPermission>([
      "cards:read",
      "cards:write",
      "cards:delete",
      "todos:write",
    ]);
    const { host, calls, context } = setup({
      declared: ["cards:read", "cards:write", "cards:delete", "todos:write"],
      granted,
    });
    await host.enable("weekly");
    await context().data.cards.create({ markdown: "# 新卡", tags: ["读书", "读书"] });
    await context().data.cards.update("3", { pinned: true }, { expectedRevision: "10" });
    await context().data.cards.delete("3", { expectedRevision: "10" });
    await context().data.todos.setCompleted("todo:1:1", true, { expectedRevision: "t1" });
    expect(calls.filter(call => call[0] !== "ensure")).toEqual([
      ["create", "card", { markdown: "# 新卡", tags: ["读书"] }],
      ["update", "card", "3", { pinned: true }, "10"],
      ["remove", "card", "3", "10"],
      [
        "writeTodo",
        { action: "complete", id: "todo:1:1", completed: true, expectedRevision: "t1" },
      ],
    ]);
    await expect(
      context().data.cards.update("3", { pinned: true }, {} as { expectedRevision: string })
    ).rejects.toThrow("expectedRevision");
    await expect(context().data.cards.update("3", {}, { expectedRevision: "10" })).rejects.toThrow(
      "没有要修改的字段"
    );
    await expect(
      context().data.cards.update("3", { title: "x" } as never, { expectedRevision: "10" })
    ).rejects.toThrow("没有要修改的字段");
    await expect(context().data.articles.create({ title: "文" })).rejects.toMatchObject({
      reason: "undeclared",
      permission: "articles:write",
    });
  });

  it("修改正文需要所属实体的写入权限", async () => {
    const writable = setup({
      declared: ["cards:read", "cards:write"],
      granted: new Set(["cards:read", "cards:write"]),
    });
    await writable.host.enable("weekly");
    expect(
      await writable
        .context()
        .content.edit("7:100", { op: "append", markdown: "补充" }, { expectedRevision: "r1" })
    ).toEqual({ revision: "r2" });
    await expect(
      writable
        .context()
        .content.edit("7:100", { op: "rename" } as never, { expectedRevision: "r1" })
    ).rejects.toThrow("未知的正文修改");

    const readonly = setup({ declared: ["cards:read"], granted: new Set(["cards:read"]) });
    await readonly.host.enable("weekly");
    await expect(
      readonly
        .context()
        .content.edit("7:100", { op: "append", markdown: "补充" }, { expectedRevision: "r1" })
    ).rejects.toMatchObject({ reason: "undeclared", permission: "cards:write" });
  });

  it("选择与打开不需要数据权限，校验类型与引用", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    expect(await context().app.pick({ kinds: ["card", "todo", "card"] })).toEqual([
      { ref: { kind: "card", id: "3" }, title: "卡" },
    ]);
    await context().app.open({ kind: "diary", id: "8" });
    expect(calls).toEqual([
      ["pick", "weekly", { kinds: ["card", "todo"], multiple: false, title: "选择要关联的内容" }],
      ["open", { kind: "diary", id: "8" }],
    ]);
    await expect(context().app.pick({ kinds: [] })).rejects.toThrow("内容类型");
    await expect(context().app.pick({ kinds: ["project" as "card"] })).rejects.toThrow("内容类型");
    await expect(context().app.open({ kind: "card", id: "" })).rejects.toThrow("ID 无效");
  });

  it("宿主动作不需要数据权限，校验动作、引用与导出格式", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    await context().app.run("content.export", { ref: "7:100", format: "pdf" });
    await context().app.run("content.present", { ref: "7:100", format: "pdf" } as never);
    expect(calls).toEqual([
      ["run", "weekly", { action: "content.export", ref: "7:100", format: "pdf" }],
      ["run", "weekly", { action: "content.present", ref: "7:100" }],
    ]);
    await expect(
      context().app.run("content.delete" as "content.share", { ref: "7:100" })
    ).rejects.toThrow("未知的动作");
    await expect(context().app.run("content.share", { ref: "" })).rejects.toThrow("正文引用无效");
    await expect(
      context().app.run("content.export", { ref: "7:100", format: "docx" as "pdf" })
    ).rejects.toThrow("导出格式无效");
  });

  it("自有内容不需要权限：先声明类型才能新建，校验 key 与 meta", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    await expect(context().entities.create({ kind: "note", key: "2026-W43" })).rejects.toThrow(
      "未声明"
    );
    const kind = context().entities.registerKind({
      kind: "note",
      label: "周记",
      open: { page: "review", params: entity => ({ week: entity.key }) },
    });
    expect(() =>
      context().entities.registerKind({ kind: "note", label: "重复", open: { page: "review" } })
    ).toThrow("已声明");
    const created = await context().entities.create({
      kind: "note",
      key: "2026-W43",
      title: "第 43 周",
      meta: { week: 43 },
    });
    expect(created.contentRef).toBe("9:100");
    await expect(context().entities.create({ kind: "note", key: "", meta: {} })).rejects.toThrow(
      "key"
    );
    await expect(
      context().entities.create({ kind: "note", key: "x", meta: [] as never })
    ).rejects.toThrow("meta");
    expect(await context().entities.find("note", "2026-W43")).toMatchObject({ id: "1" });
    await context().entities.query({ kind: "note" });
    await context().entities.update("1", { title: "改名" }, { expectedRevision: "1" });
    await context().entities.delete("1", { expectedRevision: "2" });
    await expect(context().entities.delete("1", {} as never)).rejects.toThrow("expectedRevision");
    expect(calls).toEqual([
      ["entities.create", { kind: "note", key: "2026-W43", title: "第 43 周", meta: { week: 43 } }],
      ["entities.query", { kind: "note", limit: 50 }],
      ["entities.update", "1", { title: "改名" }, "1"],
      ["entities.delete", "1", "2"],
    ]);
    kind.dispose();
    await expect(context().entities.create({ kind: "note", key: "y" })).rejects.toThrow("未声明");
  });

  it("类型图标只接受组件", async () => {
    const { host, context } = setup({ declared: [] });
    await host.enable("weekly");
    const NoteIcon = () => null;
    const kind = context().entities.registerKind({
      kind: "note",
      label: "周记",
      icon: NoteIcon,
      open: { page: "review" },
    });
    expect(() =>
      context().entities.registerKind({
        kind: "board",
        label: "看板",
        icon: "<svg/>" as never,
        open: { page: "review" },
      })
    ).toThrow("icon");
    kind.dispose();
  });

  it("本插件实体的正文直接读写，不询问权限", async () => {
    const { host, calls, context } = setup({ declared: [], owners: [], own: true });
    await host.enable("weekly");
    expect(await context().content.read("9:100")).toMatchObject({ markdown: "正文" });
    await context().content.edit(
      "9:100",
      { op: "append", markdown: "补充" },
      { expectedRevision: "r1" }
    );
    expect(calls).toEqual([["editContent", "9:100", { op: "append", markdown: "补充" }, "r1"]]);
  });

  it("反链只给已获准读取的类型，不询问权限，其余计数", async () => {
    const { host, calls, context } = setup({
      declared: ["cards:read"],
      granted: new Set<PluginPermission>(["cards:read"]),
    });
    await host.enable("weekly");
    expect(await context().entities.backlinks("1")).toEqual({
      items: [
        {
          ref: { kind: "card", id: "3" },
          title: "卡",
          snippets: [{ before: "见", label: "周记", after: "" }],
        },
      ],
      omitted: 2,
    });
    expect(calls.filter(call => call[0] === "request" || call[0] === "ensure")).toEqual([]);
  });
});
