import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  definePlugin,
  PluginConflictError,
  PLUGIN_ENTITY_READ_PERMISSIONS,
  type PluginContext,
  type PluginPermission,
} from "@tau/plugins";
import { createMemoryStorage, PluginHost } from "@tau/plugins/host";
import { PluginPermissionBroker } from "@tau/plugins/permission-host";
import type { MobileDataAdapter } from "./data";
import { createMobileOwnData } from "./own-data";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

type Request = { method: string; [key: string]: unknown };
type Args = {
  database: string;
  token: string;
  pluginId: string;
  lease: string;
  request: Request;
};
const calls = (method: string) =>
  vi.mocked(invoke).mock.calls.flatMap(([command, args]) => {
    const value = args as Args;
    return value.request.method === method ? [{ command, ...value }] : [];
  });
const content: Awaited<ReturnType<MobileDataAdapter["prepareContent"]>> = {
  nodes: [{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }],
  contracts: {},
  count: 2,
};
const entity = (id: string) => ({
  id,
  kind: "note",
  key: `key-${id}`,
  title: "内容",
  contentRef: `${id}:1`,
  meta: {},
  createdAt: 1,
  updatedAt: 1,
  revision: "1",
});
const cleanups: (() => Promise<void>)[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function fixture(
  options: { kind?: boolean; permissions?: PluginPermission[]; workspace?: string } = {}
) {
  const broker = new PluginPermissionBroker(
    {
      read: async () => ({ "test.own": { "cards:read": "granted" } }),
      write: vi.fn(async () => undefined),
    },
    () => true
  );
  const prepare = vi.fn<MobileDataAdapter["prepareContent"]>(async () => content);
  const changed = vi.fn();
  const readable = vi.fn(
    async (context: PluginContext, kind: keyof typeof PLUGIN_ENTITY_READ_PERMISSIONS) => {
      const permission = PLUGIN_ENTITY_READ_PERMISSIONS[kind];
      return !!permission && (await broker.query(context, permission)) === "granted";
    }
  );
  const own = createMobileOwnData(
    "one.db",
    "session-one",
    { prepareContent: prepare } as unknown as MobileDataAdapter,
    changed,
    readable
  );
  const host = new PluginHost({
    workspaceId: options.workspace ?? "one.db",
    storage: createMemoryStorage(),
    permissions: broker,
    entities: own.entities,
    records: own.records,
    links: own.links,
    transaction: own.transaction,
  });
  let context!: PluginContext;
  host.registerTrusted({
    ...definePlugin({
      id: "test.own",
      name: "插件数据测试",
      version: "1",
      create: () => ({
        activate(value) {
          context = value;
          value.records.registerCollection({ name: "items", indexes: { rank: "number" } });
          if (options.kind)
            value.entities.registerKind({
              kind: "note",
              label: "笔记",
              open: { page: "notes" },
              indexes: { rank: "number" },
            });
        },
      }),
    }),
    permissions: options.permissions ?? [],
  });
  await host.enable("test.own");
  cleanups.push(async () => {
    await host.dispose();
    own.dispose();
    broker.dispose();
  });
  return {
    host,
    broker,
    own,
    prepare,
    changed,
    canRead: readable,
    get context() {
      return context;
    },
  };
}

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.stubGlobal("crypto", webcrypto);
  let nextId = 0;
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const { request } = args as Args;
    if (request.method === "reserve") return String(++nextId);
    if (request.method === "entity.create") return entity(String(request.id));
    if (request.method === "record.query") return { items: [] };
    if (request.method === "record.count") return 0;
    return null;
  });
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});

it("并发首次读写共用一次认领，公共查询把声明的索引归一化后传入原生", async () => {
  const adopt = deferred<void>();
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const { request } = args as Args;
    if (request.method === "adopt") return adopt.promise;
    if (request.method === "record.query") return { items: [] };
    if (request.method === "record.count") return 0;
    return null;
  });
  const current = await fixture();
  const pending = Promise.all([
    current.context.records.get("items", "record-1"),
    current.context.entities.get("1"),
    current.context.records.query("items", {
      where: { rank: { gte: 2 } },
      orderBy: { field: "rank", direction: "desc" },
      limit: 2,
    }),
    current.context.records.count("items", { where: { rank: null } }),
  ]);
  await vi.waitFor(() => expect(calls("adopt")).toHaveLength(1));
  expect(calls("record.get")).toHaveLength(0);
  adopt.resolve();
  await expect(pending).resolves.toEqual([null, null, { items: [] }, 0]);
  expect(calls("adopt")).toHaveLength(1);
  expect(calls("record.query")[0]).toMatchObject({
    database: "one.db",
    token: "session-one",
    pluginId: "test.own",
    lease: expect.any(String),
    request: {
      method: "record.query",
      collection: "items",
      query: {
        where: [{ field: "rank", type: "number", op: "gte", value: 2 }],
        orderBy: [{ field: "rank", type: "number", direction: "desc" }],
        limit: 2,
      },
    },
  });
  expect(calls("record.count")[0].request.where).toEqual([
    { field: "rank", type: "number", op: "eq", value: null },
  ]);
  await expect(current.context.records.insert("undeclared", {})).rejects.toThrow("未声明");
  await expect(current.context.records.query("items", { where: { hidden: 1 } })).rejects.toThrow(
    "未声明为索引"
  );
});

it("实体类型登记完成前不预留身份或准备正文，创建沿用同一租约", async () => {
  const registration = deferred<void>();
  const trace: string[] = [];
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const { request } = args as Args;
    trace.push(request.method);
    if (request.method === "entity.registerKind") return registration.promise;
    if (request.method === "reserve") return "7";
    if (request.method === "entity.create") return entity("7");
    return null;
  });
  const current = await fixture({ kind: true });
  current.prepare.mockImplementation(async () => {
    trace.push("prepare");
    return content;
  });
  const created = current.context.entities.create({
    kind: "note",
    key: "week",
    title: "周记",
    content: { markdown: "正文" },
    meta: { rank: 3 },
  });
  await vi.waitFor(() => expect(calls("entity.registerKind")).toHaveLength(1));
  expect(calls("reserve")).toHaveLength(0);
  expect(current.prepare).not.toHaveBeenCalled();
  registration.resolve();
  await expect(created).resolves.toMatchObject({ id: "7", revision: "1" });
  expect(trace).toEqual(["adopt", "entity.registerKind", "reserve", "prepare", "entity.create"]);
  expect(calls("entity.create")[0]).toMatchObject({
    lease: calls("reserve")[0].lease,
    request: {
      id: "7",
      input: { kind: "note", key: "week", title: "周记", meta: { rank: 3 } },
      indexes: { rank: "number" },
      content,
    },
  });
});

it("普通写入保留 CAS，原生冲突转为公共 PluginConflictError", async () => {
  const current = await fixture({ kind: true });
  await current.own.ready(current.context);
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const { request } = args as Args;
    if (request.method === "record.update") throw "PLUGIN_CONFLICT: 记录已变化";
    if (request.method === "entity.update") throw "CONTENT_VERSION_CONFLICT: 正文已变化";
    return null;
  });
  await expect(
    current.context.records.update(
      "items",
      "record-1",
      { rank: 4 },
      { expectedRevision: "old-record" }
    )
  ).rejects.toBeInstanceOf(PluginConflictError);
  await expect(
    current.context.entities.update("7", { title: "修改" }, { expectedRevision: "old-entity" })
  ).rejects.toBeInstanceOf(PluginConflictError);
  expect(calls("record.update")[0].request).toMatchObject({
    data: { rank: 4 },
    expectedRevision: "old-record",
    indexes: { rank: "number" },
  });
  expect(calls("entity.update")[0].request).toMatchObject({
    patch: { title: "修改" },
    expectedRevision: "old-entity",
    indexes: { note: { rank: "number" } },
  });
});

it("事务先准备全部正文，再复验关联读取权限，最终只提交一次", async () => {
  const current = await fixture({ kind: true, permissions: ["cards:read"] });
  const first = deferred<Awaited<ReturnType<MobileDataAdapter["prepareContent"]>>>();
  const second = deferred<Awaited<ReturnType<MobileDataAdapter["prepareContent"]>>>();
  current.prepare
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  const transaction = current.context.transaction(async tx => {
    await tx.links.add("9", { kind: "card", id: "4" });
    await tx.entities.create({ kind: "note", key: "one", content: { markdown: "一" } });
    await tx.entities.create({ kind: "note", key: "two", content: { markdown: "二" } });
    await tx.records.insert("items", { rank: 1 });
    return "committed";
  });
  await vi.waitFor(() => expect(current.prepare).toHaveBeenCalledTimes(1));
  expect(current.canRead).not.toHaveBeenCalled();
  expect(calls("transaction")).toHaveLength(0);
  first.resolve(content);
  await vi.waitFor(() => expect(current.prepare).toHaveBeenCalledTimes(2));
  expect(current.canRead).not.toHaveBeenCalled();
  await current.broker.reset("test.own", "cards:read");
  second.resolve(content);
  await expect(transaction).resolves.toBe("committed");
  expect(current.canRead).toHaveBeenCalledOnce();
  expect(calls("transaction")).toHaveLength(1);
  const request = calls("transaction")[0].request;
  expect(request.ops).toEqual([
    expect.objectContaining({ op: "link.add", readable: false }),
    expect.objectContaining({ op: "entity.create", content }),
    expect.objectContaining({ op: "entity.create", content }),
    expect.objectContaining({
      op: "record.insert",
      collection: "items",
      indexes: { rank: "number" },
    }),
  ]);
  expect(calls("entity.create")).toHaveLength(0);
  expect(calls("record.insert")).toHaveLength(0);
  expect(calls("transaction")[0].lease).toBe(calls("reserve")[0].lease);
});

it("等待首次认领期间撤权，普通关联不能带旧读取许可提交", async () => {
  const adopt = deferred<void>();
  vi.mocked(invoke).mockImplementation(async (_command, args) =>
    (args as Args).request.method === "adopt" ? adopt.promise : null
  );
  const current = await fixture({ permissions: ["cards:read"] });
  const pending = current.context.links.add("9", { kind: "card", id: "4" });
  await vi.waitFor(() => expect(calls("adopt")).toHaveLength(1));
  await current.broker.reset("test.own", "cards:read");
  adopt.resolve();
  await pending;
  expect(calls("link.add")[0].request.readable).toBe(false);
});

it("事务等待异步类型声明后才复验关联权限", async () => {
  const registration = deferred<void>();
  vi.mocked(invoke).mockImplementation(async (_command, args) =>
    (args as Args).request.method === "entity.registerKind" ? registration.promise : null
  );
  const current = await fixture({ kind: true, permissions: ["cards:read"] });
  const transaction = current.context.transaction(async tx => {
    await tx.links.add("9", { kind: "card", id: "4" });
    await tx.records.insert("items", { rank: 1 });
  });
  await vi.waitFor(() => expect(calls("entity.registerKind")).toHaveLength(1));
  expect(calls("transaction")).toHaveLength(0);
  await current.broker.reset("test.own", "cards:read");
  registration.resolve();
  await transaction;
  expect(calls("transaction")[0].request.ops).toEqual([
    expect.objectContaining({ op: "link.add", readable: false }),
    expect.objectContaining({ op: "record.insert" }),
  ]);
});

it("旧实例释放携带旧租约，不释放重新启用后预留的实体身份", async () => {
  const oldContent = deferred<Awaited<ReturnType<MobileDataAdapter["prepareContent"]>>>();
  const oldRelease = deferred<void>();
  let id = 0;
  vi.mocked(invoke).mockImplementation(async (_command, args) => {
    const { request } = args as Args;
    if (request.method === "release") return oldRelease.promise;
    if (request.method === "reserve") return String(++id);
    if (request.method === "entity.create") return entity(String(request.id));
    return null;
  });
  const current = await fixture({ kind: true });
  current.prepare.mockImplementationOnce(() => oldContent.promise).mockResolvedValue(content);
  const previous = current.context;
  const old = previous.entities.create({ kind: "note", key: "old" });
  const oldFailure = expect(old).rejects.toThrow();
  await vi.waitFor(() => expect(current.prepare).toHaveBeenCalledOnce());
  const oldLease = calls("reserve")[0].lease;
  await current.host.disable("test.own");
  await current.host.enable("test.own");
  expect(current.context === previous).toBe(false);
  await expect(
    current.context.entities.create({ kind: "note", key: "new" })
  ).resolves.toMatchObject({ id: "2" });
  const newLease = calls("reserve")[1].lease;
  expect(newLease).not.toBe(oldLease);
  expect(calls("release")).toHaveLength(1);
  expect(calls("release")[0].lease).toBe(oldLease);
  expect(calls("entity.create")[0].lease).toBe(newLease);
  oldRelease.resolve();
  oldContent.resolve(content);
  await oldFailure;
  expect(calls("entity.create")).toHaveLength(1);
});

it("正文准备失败不提交事务，已预留身份仍只属于原实例", async () => {
  const current = await fixture({ kind: true });
  current.prepare.mockRejectedValueOnce(new Error("正文契约不允许"));
  await expect(
    current.context.transaction(async tx => {
      await tx.entities.create({ kind: "note", key: "invalid", content: { markdown: "正文" } });
      await tx.records.insert("items", {});
    })
  ).rejects.toThrow("正文契约不允许");
  expect(calls("reserve")).toHaveLength(1);
  expect(calls("transaction")).toHaveLength(0);
  await current.host.disable("test.own");
  expect(calls("release")[0].lease).toBe(calls("reserve")[0].lease);
});

it.each(["停用", "切库"])("%s 后的迟到读取不交付，失效会话不再写入", async mode => {
  const late = deferred<unknown>();
  vi.mocked(invoke).mockImplementation(async (_command, args) =>
    (args as Args).request.method === "record.get" ? late.promise : null
  );
  const current = await fixture();
  const pending = current.context.records.get("items", "record-1");
  const failure = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(calls("record.get")).toHaveLength(1));
  if (mode === "停用") await current.host.disable("test.own");
  else current.own.dispose();
  late.resolve({ id: "record-1", data: { secret: "不得交付" } });
  await failure;
  await expect(current.context.records.insert("items", {})).rejects.toThrow();
  expect(calls("record.insert")).toHaveLength(0);
});

it("工作区身份不匹配时不发送原生调用", async () => {
  const current = await fixture({ workspace: "other.db" });
  await expect(current.context.records.get("items", "record-1")).rejects.toThrow("工作区已失效");
  expect(invoke).not.toHaveBeenCalled();
});
