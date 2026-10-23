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
  type RecordsAdapter,
  type PluginTransactionOp,
  type LinksAdapter,
  type TransactionAdapter,
  type EventsAdapter,
  type PermissionsAdapter,
} from "../host";
import type { PluginDomainEvent } from "../events";
import { validatePluginManifest } from "../package";
import { EDITOR_NODE_SCHEMA_VERSION } from "../content-input";

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
    async projectTree(_context, id) {
      calls.push(["projectTree", id]);
      return id === "2" ? [] : null;
    },
    async notebookResources(_context, id) {
      calls.push(["notebookResources", id]);
      return id === "6" ? [] : null;
    },
    async createDocument(_context, input) {
      calls.push(["createDocument", input]);
      return card;
    },
    async moveDocument(_context, id, move, revision) {
      calls.push(["moveDocument", id, move, revision]);
      return { revision: "r9" };
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
    async open(_context, ref, options) {
      calls.push(["open", ref, options]);
    },
    async run(_context, plugin, request) {
      calls.push(["run", plugin.id, request]);
      if (request.action === "notebook.create") return { kind: "notebook", id: "6" } as never;
      if (request.action === "chat.start")
        return request.prompt === "取消" ? null : ({ kind: "chat-session", id: "s1" } as never);
      if (request.action === "project.insertDocument")
        return { kind: "document", id: "31" } as never;
      if (request.action === "card.create")
        return request.tags?.includes("取消")
          ? null
          : ({ kind: "card", id: "12", extra: 1 } as never);
    },
    async describe(_context, refs, readable) {
      calls.push(["describe", refs, readable]);
      // 卡片 3 为用户选择过的引用；文章已删除；其余按 readable 放行
      return refs.map(ref =>
        ref.kind === "card" && ref.id === "3"
          ? { status: "ok", title: "卡" }
          : !readable.includes(ref.kind)
            ? { status: "denied" }
            : ref.kind === "article"
              ? { status: "missing" }
              : { status: "ok", title: `${ref.kind}:${ref.id}` }
      );
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
    async create(_context, input, indexes) {
      calls.push(["entities.create", input, indexes]);
      return { ...entity, ...input };
    },
    get: async (_context, id) => (id === "1" ? entity : null),
    find: async (_context, kind, key) => (kind === "note" && key === entity.key ? entity : null),
    async query(_context, query) {
      calls.push(["entities.query", query]);
      return { items: [entity] };
    },
    async count(_context, filter) {
      calls.push(["entities.count", filter]);
      return 3;
    },
    async update(_context, id, patch, revision, indexes) {
      calls.push(["entities.update", id, patch, revision, indexes]);
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
  const record = {
    id: "r1",
    collection: "groups",
    data: {},
    createdAt: 1,
    updatedAt: 1,
    revision: "1",
  };
  const records: RecordsAdapter = {
    async insert(_context, collection, value, indexes) {
      calls.push(["records.insert", collection, typeof value.id, value.data, indexes]);
      return { ...record, collection, data: value.data };
    },
    get: async (_context, collection, id) => (id === record.id ? { ...record, collection } : null),
    async query(_context, collection, query) {
      calls.push(["records.query", collection, query]);
      return { items: [record] };
    },
    async count(_context, collection, where) {
      calls.push(["records.count", collection, where]);
      return 1;
    },
    async update(_context, collection, id, value, revision, indexes) {
      calls.push(["records.update", collection, id, value, revision, indexes]);
      return { ...record, data: value, revision: "2" };
    },
    async delete(_context, collection, id, revision) {
      calls.push(["records.delete", collection, id, revision]);
    },
  };
  const links: LinksAdapter = {
    async add(_context, link, readable) {
      calls.push(["links.add", { ...link, id: typeof link.id }, readable]);
      return { ...link, createdAt: 1 };
    },
    async list(_context, from, role) {
      calls.push(["links.list", from, role]);
      return [];
    },
    async remove(_context, id) {
      calls.push(["links.remove", id]);
    },
    async reorder(_context, from, ids) {
      calls.push(["links.reorder", from, ids]);
    },
  };
  let reserved = 100;
  const transaction: TransactionAdapter = {
    reserveEntityId: async () => String(++reserved),
    async commit(_context, ops) {
      calls.push(["transaction.commit", ops]);
    },
  };
  let context!: PluginContext;
  const host = new PluginHost({
    entities,
    records,
    links,
    transaction,
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

  it("本插件实体的事件不需要权限并带类型；其余新增对象事件按读取权限送达", async () => {
    const { host, context, emit } = setup({
      declared: ["cards:read", "materials:read"],
      granted: new Set(["cards:read"]),
    });
    await host.enable("weekly");
    const received: unknown[] = [];
    context().events.on(["entity.deleted", "material.created"], event =>
      received.push({ type: event.type, id: event.id, kind: event.kind })
    );
    emit({ type: "entity.deleted", id: "5", kind: "week", at: 1, origin: { kind: "app" } });
    emit({ type: "material.created", id: "excerpt:2", at: 1, origin: { kind: "app" } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(received).toEqual([{ type: "entity.deleted", id: "5", kind: "week" }]);
    expect(() => context().events.on("chat.updated", () => undefined)).toThrow(
      PluginPermissionError
    );
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
    await context().data.cards.create({
      content: { markdown: "# 新卡" },
      tags: ["读书", "读书"],
    });
    await context().data.cards.update("3", { pinned: true }, { expectedRevision: "10" });
    await context().data.cards.delete("3", { expectedRevision: "10" });
    await context().data.todos.setCompleted("todo:1:1", true, { expectedRevision: "t1" });
    expect(calls.filter(call => call[0] !== "ensure")).toEqual([
      ["create", "card", { content: { markdown: "# 新卡" }, tags: ["读书"] }],
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
        .content.edit(
          "7:100",
          { op: "append", content: { markdown: "补充" } },
          { expectedRevision: "r1" }
        )
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
        .content.edit(
          "7:100",
          { op: "append", content: { markdown: "补充" } },
          { expectedRevision: "r1" }
        )
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
      ["open", { kind: "diary", id: "8" }, { placement: "page" }],
    ]);
    await expect(context().app.pick({ kinds: [] })).rejects.toThrow("内容类型");
    await expect(context().app.pick({ kinds: ["folder" as "card"] })).rejects.toThrow("内容类型");
    await expect(context().app.open({ kind: "card", id: "" })).rejects.toThrow("ID 无效");
  });

  it("打开位置与定位：按类型限定窗口、停靠栏与定位，不支持的组合直接报错", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    await context().app.open({ kind: "card", id: "3" }, { placement: "window" });
    await context().app.open({ kind: "chat-session", id: "s1" }, { placement: "dock" });
    await context().app.open({ kind: "plugin-entity", id: "1" }, { at: { block: 2 } });
    expect(calls.filter(call => call[0] === "open").map(call => call[2])).toEqual([
      { placement: "window" },
      { placement: "dock" },
      { placement: "page", at: { block: 2 } },
    ]);
    const open = (ref: { kind: string; id: string }, options: unknown) =>
      context().app.open(ref as never, options as never);
    await expect(open({ kind: "todo", id: "todo:1:2" }, { placement: "window" })).rejects.toThrow(
      "独立窗口"
    );
    await expect(open({ kind: "card", id: "3" }, { placement: "dock" })).rejects.toThrow("停靠栏");
    await expect(
      open({ kind: "card", id: "3" }, { placement: "window", at: { block: 0 } })
    ).rejects.toThrow("独立窗口不支持定位");
    await expect(open({ kind: "project", id: "2" }, { at: { block: 0 } })).rejects.toThrow(
      "不支持定位"
    );
    await expect(open({ kind: "card", id: "3" }, { at: { block: -1 } })).rejects.toThrow(
      "at.block"
    );
    await expect(open({ kind: "card", id: "3" }, { placement: "tab" })).rejects.toThrow(
      "placement"
    );
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

  it("card.create：预填只校验参数，不需要数据权限，返回新卡片引用或 null", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    expect(
      await context().app.run("card.create", {
        content: { markdown: "# 想法" },
        tags: ["读书", "读书"],
      })
    ).toEqual({ kind: "card", id: "12" });
    expect(await context().app.run("card.create", { tags: ["取消"] })).toBeNull();
    expect(await context().app.run("content.present", { ref: "7:100" })).toBeUndefined();
    expect(calls.filter(call => call[0] === "run")).toEqual([
      ["run", "weekly", { action: "card.create", content: { markdown: "# 想法" }, tags: ["读书"] }],
      ["run", "weekly", { action: "card.create", tags: ["取消"] }],
      ["run", "weekly", { action: "content.present", ref: "7:100" }],
    ]);
    expect(calls.some(call => call[0] === "ensure")).toBe(false);
    await expect(
      context().app.run("card.create", { content: { html: "x" } } as never)
    ).rejects.toThrow();
    await expect(context().app.run("card.create", { tags: "x" } as never)).rejects.toThrow("标签");
    // 新建卡片窗口里用户会改动正文，不接受共用
    await expect(
      context().app.run("card.create", { content: { shareOf: "9:100" } })
    ).rejects.toThrow("shareOf 只能用于");
  });

  it("chat.start：补默认位置，校验提示词、上下文类型与数量，返回对话引用或 null", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    expect(
      await context().app.run("chat.start", {
        prompt: "围绕这个问题聊聊",
        context: [{ kind: "card", id: "3" }],
      })
    ).toEqual({ kind: "chat-session", id: "s1" });
    expect(await context().app.run("chat.start", { prompt: "取消", placement: "dock" })).toBeNull();
    expect(calls.filter(call => call[0] === "run").map(call => call[2])).toEqual([
      {
        action: "chat.start",
        prompt: "围绕这个问题聊聊",
        context: [{ kind: "card", id: "3" }],
        placement: "page",
      },
      { action: "chat.start", prompt: "取消", context: [], placement: "dock" },
    ]);
    await expect(
      context().app.run("chat.start", { context: [{ kind: "material", id: "excerpt:1" }] })
    ).rejects.toThrow("只支持卡片、文章与项目文档");
    await expect(context().app.run("chat.start", { placement: "window" } as never)).rejects.toThrow(
      "placement 无效"
    );
    await expect(context().app.run("chat.start", { prompt: "x".repeat(20_001) })).rejects.toThrow(
      "提示词"
    );
  });

  it("notebook.create：校验标题、资料与来源类型，返回 Notebook 引用", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    expect(
      await context().app.run("notebook.create", {
        title: "土地财政",
        sources: [
          { kind: "card", id: "3" },
          { kind: "material", id: "excerpt:2" },
        ],
        from: { kind: "plugin-entity", id: "1" },
      })
    ).toEqual({ kind: "notebook", id: "6" });
    await context().app.run("notebook.create", { title: "空课题" });
    expect(calls.filter(call => call[0] === "run").map(call => call[2])).toEqual([
      {
        action: "notebook.create",
        title: "土地财政",
        sources: [
          { kind: "card", id: "3" },
          { kind: "material", id: "excerpt:2" },
        ],
        from: { kind: "plugin-entity", id: "1" },
      },
      { action: "notebook.create", title: "空课题", sources: [] },
    ]);
    await expect(context().app.run("notebook.create", { title: "" })).rejects.toThrow("标题");
    await expect(
      context().app.run("notebook.create", { title: "x", from: { kind: "todo", id: "todo:1:2" } })
    ).rejects.toThrow("不能作为 Notebook 的来源");
    await expect(
      context().app.run("notebook.create", {
        title: "x",
        sources: Array.from({ length: 201 }, () => ({ kind: "card" as const, id: "1" })),
      })
    ).rejects.toThrow("最多 200 项");
    await expect(
      context().app.run("notebook.create", {
        title: "x",
        sources: [{ kind: "nope", id: "1" }],
      } as never)
    ).rejects.toThrow("内容类型无效");
  });

  it("project.insertDocument：必须带正文，标题可省略，返回新文档引用", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    expect(
      await context().app.run("project.insertDocument", {
        content: { copyOf: "7:100" },
        title: "读书笔记",
      })
    ).toEqual({ kind: "document", id: "31" });
    expect(calls.filter(call => call[0] === "run")).toEqual([
      [
        "run",
        "weekly",
        { action: "project.insertDocument", content: { copyOf: "7:100" }, title: "读书笔记" },
      ],
    ]);
    await context().app.run("project.insertDocument", { content: { shareOf: "9:100" } });
    expect(calls.filter(call => call[0] === "run").at(-1)?.[2]).toEqual({
      action: "project.insertDocument",
      content: { shareOf: "9:100" },
    });
    await expect(context().app.run("project.insertDocument", {} as never)).rejects.toThrow(
      "缺少要插入的正文"
    );
    await expect(
      context().app.run("project.insertDocument", { content: { markdown: "x" }, title: " " })
    ).rejects.toThrow("标题");
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
    await expect(
      context().entities.create({ kind: "note", key: "x", content: { shareOf: "9:100" } })
    ).rejects.toThrow("shareOf 只能用于");
    expect(await context().entities.find("note", "2026-W43")).toMatchObject({ id: "1" });
    await context().entities.query({ kind: "note" });
    await context().entities.update("1", { title: "改名" }, { expectedRevision: "1" });
    await context().entities.update("1", { meta: { week: 44 } }, { expectedRevision: "2" });
    await expect(context().entities.update("1", {}, { expectedRevision: "3" })).rejects.toThrow(
      "没有要修改的字段"
    );
    await context().entities.delete("1", { expectedRevision: "2" });
    await expect(context().entities.delete("1", {} as never)).rejects.toThrow("expectedRevision");
    expect(calls).toEqual([
      [
        "entities.create",
        { kind: "note", key: "2026-W43", title: "第 43 周", meta: { week: 43 } },
        {},
      ],
      [
        "entities.query",
        {
          kind: "note",
          where: [],
          orderBy: [{ builtin: "createdAt", direction: "desc" }],
          limit: 50,
        },
      ],
      ["entities.update", "1", { title: "改名" }, "1", { note: {} }],
      ["entities.update", "1", { meta: { week: 44 } }, "2", { note: {} }],
      ["entities.delete", "1", "2"],
    ]);
    kind.dispose();
    await expect(context().entities.create({ kind: "note", key: "y" })).rejects.toThrow("未声明");
  });

  it("索引字段：声明后才能筛选与排序，条件与排序按类型校验后交给宿主", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    expect(() =>
      context().entities.registerKind({
        kind: "bad",
        label: "坏",
        open: { page: "review" },
        indexes: { title: "string" },
      })
    ).toThrow("已被宿主使用");
    context().entities.registerKind({
      kind: "question",
      label: "问题",
      open: { page: "review" },
      indexes: { status: "string", sortIndex: "number", pinned: "boolean" },
    });
    await context().entities.query({
      kind: "question",
      where: { status: { ne: "resolved", in: ["open", null] }, pinned: true },
      titleContains: "为什么",
      orderBy: [{ field: "sortIndex" }, { field: "createdAt", direction: "desc" }],
      limit: 20,
    });
    expect(await context().entities.count({ kind: "question", where: { status: null } })).toBe(3);
    await context().entities.query();
    await expect(context().entities.query({ where: { status: "open" } })).rejects.toThrow(
      "需要同时给出 kind"
    );
    await expect(
      context().entities.query({ kind: "question", where: { groupId: "1" } })
    ).rejects.toThrow("未声明为索引");
    await expect(
      context().entities.query({ kind: "question", where: { sortIndex: "1" } })
    ).rejects.toThrow("number");
    await expect(
      context().entities.query({ kind: "question", where: { pinned: { gt: 1 } } })
    ).rejects.toThrow("不能比较大小");
    await expect(
      context().entities.query({ kind: "question", orderBy: { field: "groupId" } })
    ).rejects.toThrow("不能用于排序");
    expect(calls.filter(([name]) => name !== "entities.create")).toEqual([
      [
        "entities.query",
        {
          kind: "question",
          where: [
            { field: "status", type: "string", op: "ne", value: "resolved" },
            { field: "status", type: "string", op: "in", value: ["open", null] },
            { field: "pinned", type: "boolean", op: "eq", value: true },
          ],
          titleContains: "为什么",
          orderBy: [
            { field: "sortIndex", type: "number", direction: "asc" },
            { builtin: "createdAt", direction: "desc" },
          ],
          limit: 20,
        },
      ],
      [
        "entities.count",
        {
          kind: "question",
          where: [{ field: "status", type: "string", op: "eq", value: null }],
        },
      ],
      [
        "entities.query",
        { where: [], orderBy: [{ builtin: "createdAt", direction: "desc" }], limit: 50 },
      ],
    ]);
  });

  it("记录：先声明集合，按集合的索引字段校验；不需要权限", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    await expect(context().records.insert("groups", {})).rejects.toThrow("未声明");
    const collection = context().records.registerCollection({
      name: "groups",
      indexes: { sortIndex: "number" },
    });
    expect(() => context().records.registerCollection({ name: "groups" })).toThrow("已声明");
    expect(() =>
      context().records.registerCollection({ name: "x", indexes: { updatedAt: "number" } })
    ).toThrow("已被宿主使用");
    await context().records.insert("groups", { title: "默认", sortIndex: 1 });
    await expect(context().records.insert("groups", [] as never)).rejects.toThrow("data");
    await context().records.query("groups", { where: { sortIndex: { gt: 0 } } });
    expect(await context().records.count("groups")).toBe(1);
    await expect(context().records.query("groups", { where: { title: "默认" } })).rejects.toThrow(
      "未声明为索引"
    );
    await context().records.update("groups", "r1", { sortIndex: 2 }, { expectedRevision: "1" });
    await context().records.delete("groups", "r1", { expectedRevision: "2" });
    expect(calls).toEqual([
      [
        "records.insert",
        "groups",
        "string",
        { title: "默认", sortIndex: 1 },
        { sortIndex: "number" },
      ],
      [
        "records.query",
        "groups",
        {
          where: [{ field: "sortIndex", type: "number", op: "gt", value: 0 }],
          orderBy: [{ builtin: "createdAt", direction: "asc" }],
          limit: 50,
        },
      ],
      ["records.count", "groups", []],
      ["records.update", "groups", "r1", { sortIndex: 2 }, "1", { sortIndex: "number" }],
      ["records.delete", "groups", "r1", "2"],
    ]);
    collection.dispose();
    await expect(context().records.get("groups", "r1")).rejects.toThrow("未声明");
  });

  it("关联：校验角色与附加数据，按目标类型的已有授权判断是否可读，不弹窗", async () => {
    const { host, calls, context } = setup({
      declared: ["cards:read", "articles:read"],
      granted: new Set<PluginPermission>(["cards:read"]),
    });
    await host.enable("weekly");
    await context().links.add(
      "1",
      { kind: "card", id: "3" },
      { role: "material", data: { at: 1 } }
    );
    await context().links.add("1", { kind: "article", id: "4" });
    await expect(
      context().links.add("1", { kind: "card", id: "3" }, { role: "bad role" })
    ).rejects.toThrow();
    await expect(
      context().links.add("1", { kind: "card", id: "3" }, { data: { text: "x".repeat(5000) } })
    ).rejects.toThrow("4 KB");
    await expect(context().links.add("1", { kind: "nope", id: "3" } as never)).rejects.toThrow();
    await context().links.list("1", { role: "material" });
    await context().links.remove("l1");
    await context().links.reorder("1", ["l2", "l1"]);
    await expect(context().links.reorder("1", ["l1", "l1"])).rejects.toThrow("重复");
    expect(calls).toEqual([
      [
        "links.add",
        {
          id: "string",
          from: "1",
          to: { kind: "card", id: "3" },
          role: "material",
          data: { at: 1 },
        },
        true,
      ],
      [
        "links.add",
        { id: "string", from: "1", to: { kind: "article", id: "4" }, role: "", data: {} },
        false,
      ],
      ["links.list", "1", "material"],
      ["links.remove", "l1"],
      ["links.reorder", "1", ["l2", "l1"]],
    ]);
  });

  it("原子提交：写入按顺序一次提交，新建立即拿到 ID，revision 可省略", async () => {
    const { host, calls, context } = setup({
      declared: ["cards:read"],
      granted: new Set<PluginPermission>(["cards:read"]),
    });
    await host.enable("weekly");
    context().entities.registerKind({ kind: "question", label: "问题", open: { page: "p" } });
    context().records.registerCollection({ name: "events" });
    const result = await context().transaction(async tx => {
      const { id } = await tx.entities.create({ kind: "question", key: "q", title: "为什么" });
      await tx.links.add(id, { kind: "card", id: "3" }, { role: "material" });
      const event = await tx.records.insert("events", { questionId: id });
      await tx.entities.update("7", { title: "改" });
      await tx.entities.update("8", { meta: { status: "open" } });
      await tx.records.delete("events", "e0", { expectedRevision: "2" });
      return { id, event: typeof event.id };
    });
    expect(result).toEqual({ id: "101", event: "string" });
    const [[name, ops]] = calls.filter(([call]) => call === "transaction.commit") as [
      string,
      PluginTransactionOp[],
    ][];
    expect(name).toBe("transaction.commit");
    expect(ops.map(op => op.op)).toEqual([
      "entity.create",
      "link.add",
      "record.insert",
      "entity.update",
      "entity.update",
      "record.delete",
    ]);
    expect(ops[0]).toMatchObject({ id: "101", input: { kind: "question", key: "q" } });
    expect(ops[1]).toMatchObject({ from: "101", readable: true, role: "material" });
    expect(ops[3]).not.toHaveProperty("expectedRevision");
    expect(ops[4]).toMatchObject({ patch: { meta: { status: "open" } } });
    expect(ops[5]).toMatchObject({ expectedRevision: "2" });
    // 没有写入时不提交
    expect(await context().transaction(() => 1)).toBe(1);
    expect(calls.filter(([call]) => call === "transaction.commit")).toHaveLength(1);
  });

  it("原子提交：回调抛错、有写入失败（即使没有 await）时都不提交；结束后不能再写", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    context().records.registerCollection({ name: "events" });
    await expect(
      context().transaction(async tx => {
        await tx.records.insert("events", {});
        throw new Error("插件出错");
      })
    ).rejects.toThrow("插件出错");
    await expect(
      context().transaction(tx => {
        void tx.records.insert("events", {});
        void tx.records.insert("missing", {});
      })
    ).rejects.toThrow("未声明");
    await expect(
      context().transaction(async tx => {
        await tx.entities.update("1", { title: "x" }, { expectedRevision: "" });
      })
    ).rejects.toThrow("expectedRevision");
    let leaked: Parameters<Parameters<PluginContext["transaction"]>[0]>[0] | undefined;
    await context().transaction(tx => {
      leaked = tx;
    });
    await expect(leaked!.records.insert("events", {})).rejects.toThrow("事务已结束");
    expect(calls.filter(([call]) => call === "transaction.commit")).toHaveLength(0);
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
      { op: "append", content: { markdown: "补充" } },
      { expectedRevision: "r1" }
    );
    expect(calls).toEqual([
      ["editContent", "9:100", { op: "append", content: { markdown: "补充" } }, "r1"],
    ]);
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

  it("正文输入：三种形式都只核对目标写入权限，copyOf 不需要来源读取权限", async () => {
    const { host, calls, context } = setup({
      declared: ["cards:write"],
      granted: new Set<PluginPermission>(["cards:write"]),
    });
    await host.enable("weekly");
    const nodes = [{ type: "paragraph", children: [{ text: "原样", bold: true }] }];
    await context().data.cards.create({});
    await context().data.cards.create({ content: { copyOf: "7:100" } });
    await context().data.cards.create({ content: { nodes } as never, pinned: true });
    nodes[0].children[0].text = "改了";
    expect(calls.filter(call => call[0] === "create")).toEqual([
      ["create", "card", {}],
      ["create", "card", { content: { copyOf: "7:100" } }],
      [
        "create",
        "card",
        {
          pinned: true,
          content: { nodes: [{ type: "paragraph", children: [{ text: "原样", bold: true }] }] },
        },
      ],
    ]);
    expect(calls.filter(call => call[0] === "ensure").flat()).not.toContain("cards:read");
  });

  it("正文修改：append 不能为空，replaceAll 可以为空，replaceText 仍为 Markdown", async () => {
    const { host, calls, context } = setup({
      declared: ["cards:write"],
      granted: new Set<PluginPermission>(["cards:write"]),
    });
    await host.enable("weekly");
    const edit = (value: unknown) =>
      context().content.edit("7:100", value as never, { expectedRevision: "r1" });
    await expect(edit({ op: "append", content: { markdown: "  " } })).rejects.toThrow(
      "正文不能为空"
    );
    await expect(edit({ op: "prepend", content: { nodes: [] } })).rejects.toThrow("正文不能为空");
    await expect(edit({ op: "append", markdown: "旧写法" })).rejects.toThrow("正文输入无效");
    await edit({ op: "replaceAll", content: { nodes: [] } });
    await edit({ op: "replaceText", find: "甲", markdown: "乙" });
    expect(calls.filter(call => call[0] === "editContent").map(call => call[2])).toEqual([
      { op: "replaceAll", content: { nodes: [] } },
      { op: "replaceText", find: "甲", markdown: "乙" },
    ]);
  });

  it("nodes 格式的正文快照带节点结构版本", async () => {
    const { host, context } = setup({
      declared: ["cards:read"],
      granted: new Set<PluginPermission>(["cards:read"]),
    });
    await host.enable("weekly");
    expect(await context().content.read("7:100", { format: "nodes" })).toMatchObject({
      schemaVersion: EDITOR_NODE_SCHEMA_VERSION,
    });
    expect(await context().content.read("7:100")).not.toHaveProperty("schemaVersion");
  });

  it("插件实体新建可带初始正文，不需要业务权限", async () => {
    const { host, calls, context } = setup({ declared: [] });
    await host.enable("weekly");
    context().entities.registerKind({ kind: "note", label: "周记", open: { page: "review" } });
    await context().entities.create({
      kind: "note",
      key: "2026-W44",
      content: { markdown: "# 本周" },
    });
    await expect(
      context().entities.create({
        kind: "note",
        key: "2026-W45",
        content: { markdown: "a", copyOf: "7:100" } as never,
      })
    ).rejects.toThrow("只能提供");
    expect(calls.find(call => call[0] === "entities.create")?.[1]).toMatchObject({
      key: "2026-W44",
      content: { markdown: "# 本周" },
    });
    expect(calls.filter(call => call[0] === "ensure" || call[0] === "request")).toEqual([]);
  });

  it("describe 只查询已有授权、不弹窗，未获准的给出所需权限", async () => {
    const { host, calls, context } = setup({
      declared: ["articles:read", "chats:read"],
      granted: new Set<PluginPermission>(["articles:read"]),
    });
    await host.enable("weekly");
    const result = await context().app.describe([
      { kind: "card", id: "3" },
      { kind: "article", id: "5" },
      { kind: "chat-session", id: "s1" },
      { kind: "diary", id: "8" },
      { kind: "project", id: "2" },
    ]);
    expect(result).toEqual([
      { ref: { kind: "card", id: "3" }, status: "ok", title: "卡" },
      { ref: { kind: "article", id: "5" }, status: "missing" },
      { ref: { kind: "chat-session", id: "s1" }, status: "denied", permission: "chats:read" },
      { ref: { kind: "diary", id: "8" }, status: "denied", permission: null },
      { ref: { kind: "project", id: "2" }, status: "denied", permission: "projects:read" },
    ]);
    expect(calls.find(call => call[0] === "describe")?.[2]).toEqual(["article"]);
    expect(calls.filter(call => call[0] === "request" || call[0] === "ensure")).toEqual([]);
    await expect(context().app.describe([{ kind: "folder", id: "1" }] as never)).rejects.toThrow(
      "内容类型无效"
    );
    await expect(
      context().app.describe(Array.from({ length: 201 }, () => ({ kind: "card", id: "1" })))
    ).rejects.toThrow("最多 200 项");
  });

  it("白板与项目：读写分别需要对应权限，按类型校验字段", async () => {
    const { host, calls, context } = setup({
      declared: ["whiteboards:read", "whiteboards:write", "projects:read", "projects:write"],
      granted: new Set<PluginPermission>([
        "whiteboards:read",
        "whiteboards:write",
        "projects:read",
        "projects:write",
      ]),
    });
    await host.enable("weekly");
    await context().data.whiteboards.create({ title: "思路", tags: ["课题", "课题"] });
    await context().data.whiteboards.update("4", { description: "" }, { expectedRevision: "1" });
    await context().data.projects.create({ title: "课题" });
    await context().data.projects.update("2", { archived: true }, { expectedRevision: "1" });
    await context().data.projects.query({ sort: "created" });
    expect(calls.filter(call => call[0] !== "ensure")).toEqual([
      ["create", "whiteboard", { title: "思路", tags: ["课题"] }],
      ["update", "whiteboard", "4", { description: "" }, "1"],
      ["create", "project", { title: "课题" }],
      ["update", "project", "2", { archived: true }, "1"],
      ["query", "project", { sort: "created", limit: 50 }],
    ]);
    expect(calls.filter(call => call[0] === "ensure").map(call => call[2])).toEqual([
      "whiteboards:write",
      "whiteboards:write",
      "projects:write",
      "projects:write",
      "projects:read",
    ]);
    await expect(context().data.whiteboards.create({ title: "" })).rejects.toThrow("title");
    await expect(context().data.projects.query({ tag: "读书" })).rejects.toThrow("没有标签");
    await expect(
      context().data.projects.update("2", { tags: ["x"] } as never, { expectedRevision: "1" })
    ).rejects.toThrow("没有要修改的字段");
    await expect(
      context().data.whiteboards.update("4", { archived: true } as never, { expectedRevision: "1" })
    ).rejects.toThrow("没有要修改的字段");
  });

  it("项目目录与文档新建、移动：读目录需要项目读取权限，写入需要文档写入权限", async () => {
    const { host, calls, context } = setup({
      declared: ["projects:read", "documents:write"],
      granted: new Set<PluginPermission>(["projects:read", "documents:write"]),
    });
    await host.enable("weekly");
    expect(await context().data.projects.tree("2")).toEqual([]);
    expect(await context().data.projects.tree("9")).toBeNull();
    await context().data.documents.create({
      projectId: "2",
      title: "笔记",
      content: { markdown: "# 笔记" },
    });
    expect(
      await context().data.documents.move(
        "31",
        { projectId: "2", from: null, to: "30", index: 0 },
        { expectedRevision: "r1" }
      )
    ).toEqual({ revision: "r9" });
    expect(calls.filter(call => call[0] !== "ensure")).toEqual([
      ["projectTree", "2"],
      ["projectTree", "9"],
      ["createDocument", { title: "笔记", projectId: "2", content: { markdown: "# 笔记" } }],
      ["moveDocument", "31", { projectId: "2", from: null, to: "30", index: 0 }, "r1"],
    ]);
    expect(calls.filter(call => call[0] === "ensure").map(call => call[2])).toEqual([
      "projects:read",
      "projects:read",
      "documents:write",
      "documents:write",
    ]);
    await expect(context().data.documents.create({ title: "无项目" } as never)).rejects.toThrow(
      "ID 无效"
    );
    await expect(
      context().data.documents.move("31", { projectId: "2", to: "30" } as never, {
        expectedRevision: "r1",
      })
    ).rejects.toThrow("from 与 to");
    await expect(
      context().data.documents.move(
        "31",
        { projectId: "2", from: null, to: null, index: -1 },
        { expectedRevision: "r1" }
      )
    ).rejects.toThrow("非负整数");
  });

  it("白板、项目与项目文档的删除需要对应的删除权限", async () => {
    const { host, calls, context } = setup({
      declared: ["whiteboards:delete", "projects:delete", "documents:delete"],
      granted: new Set<PluginPermission>(["whiteboards:delete", "projects:delete"]),
    });
    await host.enable("weekly");
    await context().data.whiteboards.delete("4", { expectedRevision: "1" });
    await context().data.projects.delete("2", { expectedRevision: "1" });
    await expect(
      context().data.documents.delete("31", { expectedRevision: "1" })
    ).rejects.toMatchObject({ permission: "documents:delete" });
    expect(calls.filter(call => call[0] === "remove")).toEqual([
      ["remove", "whiteboard", "4", "1"],
      ["remove", "project", "2", "1"],
    ]);
  });

  it("Notebook、材料与对话只读：读取需要对应权限，不支持 tag，没有写入方法", async () => {
    const { host, calls, context } = setup({
      declared: ["notebooks:read", "materials:read", "chats:read"],
      granted: new Set<PluginPermission>(["notebooks:read", "materials:read"]),
    });
    await host.enable("weekly");
    await context().data.notebooks.query({ sort: "created" });
    expect(await context().data.notebooks.resources("6")).toEqual([]);
    expect(await context().data.notebooks.resources("9")).toBeNull();
    await context().data.materials.get("excerpt:3");
    expect(calls.filter(call => call[0] !== "ensure")).toEqual([
      ["query", "notebook", { sort: "created", limit: 50 }],
      ["notebookResources", "6"],
      ["notebookResources", "9"],
    ]);
    expect(calls.filter(call => call[0] === "ensure").map(call => call[2])).toEqual([
      "notebooks:read",
      "notebooks:read",
      "notebooks:read",
      "materials:read",
    ]);
    await expect(context().data.chats.query()).rejects.toMatchObject({ permission: "chats:read" });
    await expect(context().data.materials.query({ tag: "读书" })).rejects.toThrow("没有标签");
    await expect(context().data.notebooks.resources("")).rejects.toThrow("ID 无效");
    expect("update" in context().data.notebooks).toBe(false);
    expect("create" in context().data.materials).toBe(false);
  });
});
