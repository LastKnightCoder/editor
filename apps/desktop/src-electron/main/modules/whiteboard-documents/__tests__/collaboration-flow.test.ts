// @vitest-environment node
import Database from "better-sqlite3";
import * as Y from "yjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import schema from "@tau/db-schema/schema/main.sql?raw";
import {
  WhiteboardModel,
  createWhiteboardDocument,
  type DocumentSyncSession,
} from "@tau/collaboration";
import { CollaborationAssetService } from "../../collaboration/asset-service";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { ContentLocalState } from "../../collaboration/content-local-state";
import { ContentIdentityTable } from "../../tables/content-identity";
import { createServer } from "../../../../../../collaboration-server/src/server";
import { replaceStoredBaseline } from "../../../../../../collaboration-server/src/testing/replace-baseline";

/** 两台设备各自一套主进程白板模块与本机库，经真实服务端路由协作。 */
const state = vi.hoisted(() => ({
  dir: "",
  store: null as CollaborationLocalStore | null,
  assets: null as CollaborationAssetService | null,
  databases: new Map<string, Database.Database>(),
  windowToDatabase: new Map<number, string>(),
  handlers: new Map<string, (...args: any[]) => any>(),
  windows: [] as any[],
  sent: [] as { owner: number; channel: string; data: any }[],
  client: null as any,
  pushReceivers: [] as ((state: Uint8Array) => Promise<void>)[],
}));
// 此处验证耐久 HTTP 编排；真实推送连接由 realtime.test.ts 覆盖。
vi.mock("../realtime", () => ({
  WhiteboardRealtime: class {
    constructor(
      _client: unknown,
      _url: unknown,
      _protocol: unknown,
      receive: (state: Uint8Array) => Promise<void>
    ) {
      state.pushReceivers.push(receive);
    }
    presence() {}
    dispose() {}
  },
}));
vi.mock("electron", () => ({
  app: { on: vi.fn() },
  ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => state.handlers.set(name, fn) },
  BrowserWindow: {
    getAllWindows: () => state.windows,
    fromId: (id: number) => state.windows.find(w => w.id === id),
    fromWebContents: (sender: unknown) => state.windows.find(w => w.webContents === sender),
  },
}));
vi.mock("../../collaboration", () => ({
  default: {
    documentClient: () => state.client,
    documentStorage: () => ({
      state: new ContentLocalState(state.store!.db),
      store: state.store,
    }),
    documentAssets: () => state.assets,
    refreshShared: async () => {},
  },
}));
vi.mock("../../database", () => ({
  default: {
    databases: state.databases,
    windowToDatabase: state.windowToDatabase,
    getDatabase: (name: string) => state.databases.get(name),
    onDatabaseConnected: vi.fn(),
  },
}));
vi.mock("../../../utils/PathUtil", () => ({ default: { getAppDir: () => state.dir } }));
vi.mock("../../tables/data-table", () => ({
  default: { incrementRefCount: vi.fn(), remove: vi.fn() },
}));
vi.mock("../../tables/white-board-content", () => ({
  default: { incrementRefCount: vi.fn(), deleteWhiteboard: vi.fn() },
}));

type Server = Awaited<ReturnType<typeof createServer>>;
type Device = { id: string; secret: string; nickname: string };
const URL = "https://collab.test";
const cleanup: (() => unknown)[] = [];
let server: Server;
let acting: Device;
let offline = false;
let dropNextPublish = false;
let upgrade = false;

/** 与 CollaborationClient 相同的错误形状：status/code 来自服务端，断网是 TypeError。 */
function client(): any {
  return {
    serverTime: () => Date.now(),
    identity: async () => acting,
    async request(_url: string, path: string, method = "GET", body?: unknown, version?: number) {
      if (offline) throw new TypeError("fetch failed");
      if (upgrade && path.endsWith("/state"))
        throw Object.assign(new Error("请使用支持当前文档协议的客户端"), {
          status: 409,
          code: "CLIENT_UPGRADE_REQUIRED",
        });
      const response = await server.app.inject({
        method: method as "GET",
        url: path,
        headers: {
          authorization: `Bearer ${acting.id}:${acting.secret}`,
          ...(version === undefined ? {} : { "x-tau-document-version": String(version) }),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        payload: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = response.json();
      if (response.statusCode >= 400)
        throw Object.assign(new Error(result.message ?? "协作请求失败"), {
          status: response.statusCode,
          code: String(result.code ?? "REQUEST_FAILED"),
        });
      if (dropNextPublish && path.endsWith("/publish")) {
        dropNextPublish = false;
        throw new TypeError("fetch failed");
      }
      return result;
    },
  };
}

interface Side {
  module: {
    remote: Map<string, Promise<DocumentSyncSession>>;
    remoteViews: Map<string, { key: string }>;
    serialRemote<T>(key: string, task: () => Promise<T>): Promise<T>;
  };
  device: Device;
  window: number;
  database: string;
  handlers: Map<string, (...args: any[]) => any>;
  db: Database.Database;
  store: CollaborationLocalStore;
  dir: string;
}
async function side(nickname: string, window: number, database: string): Promise<Side> {
  vi.resetModules();
  state.dir = mkdtempSync(join(tmpdir(), `whiteboard-flow-${database}-`));
  state.store = new CollaborationLocalStore(join(state.dir, "collaboration"));
  state.assets = new CollaborationAssetService(state.store, state.dir, async () => acting);
  const db = new Database(":memory:");
  db.exec(schema);
  ContentIdentityTable.establishBaseline(db);
  state.databases.set(database, db);
  state.windowToDatabase.set(window, database);
  state.handlers.clear();
  const module = (await import("../index")).default as any;
  await module.init();
  const store = state.store,
    dir = state.dir;
  cleanup.push(() => {
    module.sessions.dispose();
    module.sessions.journal.close();
    db.close();
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    module,
    device: server.store.register(nickname),
    window,
    database,
    handlers: new Map(state.handlers),
    db,
    store,
    dir,
  };
}
const call = (side: Side, name: string, ...args: unknown[]) => {
  acting = side.device;
  return side.handlers.get(`whiteboard-document:${name}`)!(
    { sender: state.windows.find(w => w.id === side.window).webContents },
    ...args
  );
};
/** 渲染端排空回执：模拟窗口冲刷 outbox 后确认。 */
async function acknowledgeDrains(target: Side) {
  await vi.waitFor(() =>
    expect(
      state.sent.some(event => event.channel === "whiteboard-document:drain" && !event.data.done)
    ).toBe(true)
  );
  for (const event of state.sent.filter(
    item => item.channel === "whiteboard-document:drain" && !item.data.done
  )) {
    event.data.done = true;
    await call(target, "drained", event.data.requestId);
  }
}
async function edit(target: Side, leaseId: string, text: string) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, call(target, "snapshot", leaseId).state);
  const model = new WhiteboardModel(doc),
    updates: Uint8Array[] = [];
  doc.on("update", update => updates.push(update));
  model.submit(
    [{ type: "edit_title", edit: { offset: model.read().title.length, remove: 0, text } }],
    {}
  );
  try {
    return await call(target, "append", leaseId, randomUUID(), Y.mergeUpdates(updates));
  } finally {
    model.dispose();
    doc.destroy();
  }
}
const localTitle = (target: Side, leaseId: string) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, call(target, "snapshot", leaseId).state);
  const model = new WhiteboardModel(doc);
  try {
    return model.read().title;
  } finally {
    model.dispose();
    doc.destroy();
  }
};
const remoteTitle = (roomId: string) => {
  const doc = server.store.loadDocument(roomId);
  const model = new WhiteboardModel(doc);
  try {
    return model.read().title;
  } finally {
    model.dispose();
    doc.destroy();
  }
};
async function sharedBoard(owner: Side) {
  const source = new Y.Doc(),
    model = new WhiteboardModel(source);
  model.submit(
    [
      { type: "edit_title", edit: { offset: 0, remove: 0, text: "看板" } },
      { type: "create_page", title: "第一页" },
    ],
    null
  );
  const created = await call(
    owner,
    "create",
    owner.database,
    "board",
    Y.encodeStateAsUpdate(source),
    "board"
  );
  const pageIds = model.read().pages.map(page => page.id);
  model.dispose();
  source.destroy();
  const lease = await call(owner, "open", owner.database, created.contentIds[0], "owner-view");
  const publishing = call(owner, "publish", lease.leaseId, {
    operationId: "share-1",
    serverUrl: URL,
    pageIds,
  });
  await acknowledgeDrains(owner);
  const room = await publishing;
  return { created, pageIds, lease, room };
}

beforeEach(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "whiteboard-flow-server-"));
  server = await createServer({ dataDir, logger: false });
  await server.app.ready();
  cleanup.push(async () => {
    await server.app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  offline = false;
  dropNextPublish = false;
  upgrade = false;
  state.client = client();
  state.sent = [];
  state.pushReceivers = [];
  state.databases.clear();
  state.windowToDatabase.clear();
  state.windows = [1, 2].map(id => ({
    id,
    isDestroyed: () => false,
    once: vi.fn(),
    webContents: {
      isDestroyed: () => false,
      on: vi.fn(),
      send: (channel: string, data: unknown) => state.sent.push({ owner: id, channel, data }),
    },
  }));
});
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

it("首次共享只建立一个房间；响应丢失后按原操作续做，重复发起不建并行房间", async () => {
  const owner = await side("作者", 1, "A");
  const source = new Y.Doc(),
    model = new WhiteboardModel(source);
  model.submit([{ type: "create_page", title: "页" }], null);
  const created = await call(owner, "create", "A", "board", Y.encodeStateAsUpdate(source), "board");
  const pageIds = model.read().pages.map(page => page.id);
  model.dispose();
  source.destroy();
  const lease = await call(owner, "open", "A", created.contentIds[0], "view");
  dropNextPublish = true;
  const first = call(owner, "publish", lease.leaseId, {
    operationId: "share-1",
    serverUrl: URL,
    pageIds,
  });
  await acknowledgeDrains(owner);
  await expect(first).rejects.toThrow(/^OFFLINE: /);
  const pending = call(owner, "share-status", "A", created.documentId);
  expect(pending.binding).toBeNull();
  expect(pending.publication).toEqual({ operationId: "share-1", roomCreated: true });
  // 结果未知期间白板保持暂停，另起操作被拒，不能制造第二个房间。
  await expect(
    call(owner, "append", lease.leaseId, "late", new Uint8Array([0, 0]))
  ).rejects.toThrow();
  await expect(
    call(owner, "publish", lease.leaseId, { operationId: "share-2", serverUrl: URL, pageIds })
  ).rejects.toThrow();
  const resumed = await call(owner, "publish-resume", "A", "share-1");
  const status = call(owner, "share-status", "A", created.documentId);
  expect(status.publication).toBeNull();
  expect(status.binding).toEqual({ serverUrl: URL, documentId: resumed.documentId });
  expect(server.store.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 1 });
  const detached = state.sent.filter(event => event.channel === "whiteboard-document:detached");
  expect(detached).toHaveLength(1);
  const reopened = await call(owner, "open", "A", created.contentIds[0], "view-2");
  await expect(
    call(owner, "publish", reopened.leaseId, { operationId: "share-3", serverUrl: URL, pageIds })
  ).rejects.toThrow("已绑定共享");
  expect(server.store.db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 1 });
});

it("成员落库、双向同步：本机保存与远端确认分开，远端投影不回写也不重复提交", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const ownerLease = await call(owner, "open", "A", created.contentIds[0], "owner-2");
  expect(await call(owner, "remote-open", ownerLease.leaseId, URL)).toMatchObject({
    requiresRebind: false,
  });
  const local = await edit(owner, ownerLease.leaseId, "·作者");
  expect(local.projectedRevision).toBe(local.revision);
  // 只保存在本机，尚未提交到服务端。
  expect(remoteTitle(room.documentId)).toBe("看板");
  const synced = await call(owner, "remote-sync", ownerLease.leaseId);
  expect(synced).toMatchObject({ requiresRebind: false, requiresSync: false, pending: 0 });
  expect(synced.localRevision).toBe(local.revision);
  expect(remoteTitle(room.documentId)).toBe("看板·作者");

  const invitation = server.store.rotateCode(room.documentId, owner.device.id);
  const member = await side("成员", 2, "B");
  const request = server.store.requestJoin(invitation.code, member.device.id);
  if (request.status !== "pending") throw new Error("未创建申请");
  server.store.decide(request.id, owner.device.id, true);
  const installed = await call(member, "remote-install", "B", URL, room.documentId);
  expect(await call(member, "remote-install", "B", URL, room.documentId)).toEqual(installed);
  expect(member.db.prepare("SELECT count(*) AS n FROM whiteboard_documents").get()).toEqual({
    n: 1,
  });
  const memberLease = await call(member, "open", "B", installed.contentIds[0], "member");
  expect(localTitle(member, memberLease.leaseId)).toBe("看板·作者");
  expect(await call(member, "remote-open", memberLease.leaseId, URL)).toMatchObject({
    requiresRebind: false,
  });
  await edit(member, memberLease.leaseId, "·成员");
  await call(member, "remote-sync", memberLease.leaseId);
  const sequence = server.store.operations.sequence(room.documentId);

  state.sent = [];
  const before = call(owner, "snapshot", ownerLease.leaseId).revision;
  const received = await call(owner, "remote-sync", ownerLease.leaseId);
  expect(localTitle(owner, ownerLease.leaseId)).toBe("看板·作者·成员");
  expect(received.localRevision).toBe(before + 1);
  const projected = state.sent.filter(
    event => event.channel === "whiteboard-document:update" && event.data.update
  );
  expect(projected).toHaveLength(1);
  // 再同步一次：远端投影已在本机，不再作为本机编辑提交，也不推进本机修订。
  const again = await call(owner, "remote-sync", ownerLease.leaseId);
  expect(again.localRevision).toBe(received.localRevision);
  expect(server.store.operations.sequence(room.documentId)).toBe(sequence);
});

it("服务端推送立即耐久投影，重复状态不推进修订，释放后忽略迟到推送", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "push-view");
  await call(owner, "remote-open", lease.leaseId, URL);
  const receive = state.pushReceivers.at(-1)!;
  const doc = server.store.loadDocument(room.documentId);
  const model = new WhiteboardModel(doc);
  try {
    model.submit([{ type: "edit_title", edit: { offset: 2, remove: 0, text: "·推送" } }], {});
    const before = call(owner, "snapshot", lease.leaseId).revision;
    let unblock!: () => void;
    const gate = new Promise<void>(resolve => {
      unblock = resolve;
    });
    const key = owner.module.remoteViews.get(lease.leaseId)!.key;
    const waiting = owner.module.serialRemote(key, () => gate);
    try {
      let applied = false;
      const receiving = receive(Y.encodeStateAsUpdate(doc)).then(() => {
        applied = true;
      });
      await vi.waitFor(() => expect(applied).toBe(true), { timeout: 1000 });
      await receiving;
    } finally {
      unblock();
      await waiting;
    }
    expect(localTitle(owner, lease.leaseId)).toBe("看板·推送");
    expect(call(owner, "snapshot", lease.leaseId).revision).toBe(before + 1);
    await receive(Y.encodeStateAsUpdate(doc));
    expect(call(owner, "snapshot", lease.leaseId).revision).toBe(before + 1);
    await call(owner, "release", lease.leaseId);
    await expect(receive(Y.encodeStateAsUpdate(doc))).resolves.toBeUndefined();
  } finally {
    model.dispose();
    doc.destroy();
  }
});

it("断连与关页：待发送内容留在本机日志，重开重连后只提交一次", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "owner-2");
  await call(owner, "remote-open", lease.leaseId, URL);
  await edit(owner, lease.leaseId, "·离线");
  offline = true;
  await expect(call(owner, "remote-sync", lease.leaseId)).rejects.toThrow(/^OFFLINE: /);
  await call(owner, "release", lease.leaseId);
  offline = false;
  const reopened = await call(owner, "open", "A", created.contentIds[0], "owner-3");
  expect(localTitle(owner, reopened.leaseId)).toBe("看板·离线");
  expect(remoteTitle(room.documentId)).toBe("看板");
  await call(owner, "remote-open", reopened.leaseId, URL);
  await call(owner, "remote-sync", reopened.leaseId);
  expect(remoteTitle(room.documentId)).toBe("看板·离线");
  const sequence = server.store.operations.sequence(room.documentId);
  await call(owner, "remote-sync", reopened.leaseId);
  expect(server.store.operations.sequence(room.documentId)).toBe(sequence);
});

it("同一设备两个窗口并发同步共用一个远端会话，同一份本机差异只提交一次", async () => {
  const owner = await side("作者", 1, "A");
  state.windowToDatabase.set(2, "A");
  const second: Side = { ...owner, window: 2 };
  const { created, room } = await sharedBoard(owner);
  const a = await call(owner, "open", "A", created.contentIds[0], "window-a");
  const b = await call(second, "open", "A", created.contentIds[0], "window-b");
  await call(owner, "remote-open", a.leaseId, URL);
  await call(second, "remote-open", b.leaseId, URL);
  await edit(owner, a.leaseId, "·并发");
  const sequence = server.store.operations.sequence(room.documentId);
  const [left, right] = await Promise.all([
    call(owner, "remote-sync", a.leaseId),
    call(second, "remote-sync", b.leaseId),
  ]);
  expect(left.requiresRebind || right.requiresRebind).toBe(false);
  expect(server.store.operations.sequence(room.documentId)).toBe(sequence + 1);
  expect(remoteTitle(room.documentId)).toBe("看板·并发");
  // 一个窗口关闭只释放自己的持有，另一窗口继续同步。
  await call(owner, "release", a.leaseId);
  await edit(second, b.leaseId, "·继续");
  await call(second, "remote-sync", b.leaseId);
  expect(remoteTitle(room.documentId)).toBe("看板·并发·继续");
});

it("缺少依赖的提案保持待确认，不推进远端序号也不误报已同步", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "owner-2");
  await call(owner, "remote-open", lease.leaseId, URL);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, call(owner, "snapshot", lease.leaseId).state);
  const model = new WhiteboardModel(doc);
  model.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "甲" } }], {});
  const vector = Y.encodeStateVector(doc);
  model.submit([{ type: "edit_title", edit: { offset: 1, remove: 0, text: "乙" } }], {});
  const orphan = Y.encodeStateAsUpdate(doc, vector);
  model.dispose();
  doc.destroy();
  await (await [...owner.module.remote.values()][0]).stage(orphan);
  const sequence = server.store.operations.sequence(room.documentId);
  const missing = /^MISSING_DEPENDENCIES: /;
  await expect(call(owner, "remote-sync", lease.leaseId)).rejects.toThrow(missing);
  await expect(call(owner, "remote-sync", lease.leaseId)).rejects.toThrow(missing);
  expect(server.store.operations.sequence(room.documentId)).toBe(sequence);
  expect(remoteTitle(room.documentId)).toBe("看板");
});

it("权限撤销与版本不兼容只报告原因，本机内容不被覆盖", async () => {
  const owner = await side("作者", 1, "A");
  const { room } = await sharedBoard(owner);
  const invitation = server.store.rotateCode(room.documentId, owner.device.id);
  const member = await side("成员", 2, "B");
  const request = server.store.requestJoin(invitation.code, member.device.id);
  if (request.status !== "pending") throw new Error("未创建申请");
  server.store.decide(request.id, owner.device.id, true);
  const installed = await call(member, "remote-install", "B", URL, room.documentId);
  const lease = await call(member, "open", "B", installed.contentIds[0], "member");
  await call(member, "remote-open", lease.leaseId, URL);
  await edit(member, lease.leaseId, "·未同步");
  server.store.removeMember(room.documentId, owner.device.id, member.device.id);
  await expect(call(member, "remote-sync", lease.leaseId)).rejects.toThrow(/^FORBIDDEN: /);
  expect(localTitle(member, lease.leaseId)).toBe("看板·未同步");
  expect(remoteTitle(room.documentId)).toBe("看板");
  upgrade = true;
  await expect(call(member, "remote-install", "B", URL, "other-room")).rejects.toThrow(
    /^CLIENT_UPGRADE_REQUIRED: /
  );
});

it("远端换代后暂停同步且不覆盖本机文档，不注册版本恢复入口", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "owner-2");
  await call(owner, "remote-open", lease.leaseId, URL);
  await edit(owner, lease.leaseId, "·旧代次");
  const fresh = new Y.Doc(),
    freshModel = new WhiteboardModel(fresh);
  freshModel.submit(
    [
      { type: "edit_title", edit: { offset: 0, remove: 0, text: "新代次" } },
      { type: "create_page", title: "页" },
    ],
    {}
  );
  const next = await createWhiteboardDocument(
    { documentId: room.documentId, baselineId: "next", epoch: 1 },
    Y.encodeStateAsUpdate(fresh)
  );
  replaceStoredBaseline(server.store, room.documentId, next);
  freshModel.dispose();
  fresh.destroy();
  next.destroy();
  const before = call(owner, "snapshot", lease.leaseId);
  expect(await call(owner, "remote-sync", lease.leaseId)).toMatchObject({
    requiresRebind: true,
    reason: "epoch",
  });
  expect(remoteTitle(room.documentId)).toBe("新代次");
  expect(call(owner, "snapshot", lease.leaseId).state).toEqual(before.state);
  expect(owner.handlers.has("whiteboard-document:adopt")).toBe(false);
});

/** 作者邀请、成员加入并落库，返回成员侧已连接远端的租约。 */
async function joinMember(owner: Side, roomId: string) {
  const invitation = server.store.rotateCode(roomId, owner.device.id);
  const member = await side("成员", 2, "B");
  const request = server.store.requestJoin(invitation.code, member.device.id);
  if (request.status !== "pending") throw new Error("未创建申请");
  server.store.decide(request.id, owner.device.id, true);
  const installed = await call(member, "remote-install", "B", URL, roomId);
  const lease = await call(member, "open", "B", installed.contentIds[0], "member");
  await call(member, "remote-open", lease.leaseId, URL);
  return { member, installed, lease };
}
const firstPage = (target: Side) =>
  (
    target.db.prepare("SELECT content_id FROM whiteboard_document_pages LIMIT 1").get() as {
      content_id: number;
    }
  ).content_id;
const isShared = (target: Side, leaseId: string) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, call(target, "snapshot", leaseId).state);
  try {
    return doc.share.has("meta") && doc.getMap("meta").get("version") === 3;
  } finally {
    doc.destroy();
  }
};
async function unshare(
  target: Side,
  leaseId: string,
  mode: string,
  operationId: string = randomUUID()
) {
  const running = call(target, "unshare", leaseId, { operationId, mode });
  await acknowledgeDrains(target);
  return running;
}

it("作者结束共享：房间关闭、本机留下不带共享身份的白板，之后可用新房间再次共享", async () => {
  const owner = await side("作者", 1, "A");
  const { created, pageIds, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "owner-2");
  await call(owner, "remote-open", lease.leaseId, URL);
  const { member, lease: memberLease } = await joinMember(owner, room.documentId);
  await edit(member, memberLease.leaseId, "·成员");
  await call(member, "remote-sync", memberLease.leaseId);
  await edit(owner, lease.leaseId, "·作者未同步");

  offline = true;
  await expect(unshare(owner, lease.leaseId, "close")).rejects.toThrow(/^OFFLINE: /);
  offline = false;
  // 断网失败：仍是共享白板，绑定与内容都没变，也没有遗留待装的本机迁移。
  expect(call(owner, "share-status", "A", created.documentId)).toMatchObject({
    binding: { documentId: room.documentId },
  });
  expect(isShared(owner, lease.leaseId)).toBe(true);

  expect(await unshare(owner, lease.leaseId, "close")).toEqual({ missing: 0 });
  expect(server.store.document(room.documentId).status).toBe("closed");
  expect(call(owner, "share-status", "A", created.documentId).binding).toBeNull();
  const local = await call(owner, "open", "A", created.contentIds[0], "owner-3");
  expect(isShared(owner, local.leaseId)).toBe(false);
  // 关闭前先取回他人已确认的编辑，本机未同步的编辑也保留（两处并发插入的先后由 CRDT 决定）。
  const title = localTitle(owner, local.leaseId);
  expect(title).toContain("·成员");
  expect(title).toContain("·作者未同步");
  await expect(call(owner, "remote-open", local.leaseId, URL)).rejects.toThrow("首次发布");

  // 成员侧：共享已结束，同步报告原因；转为本机白板后内容保留。
  await expect(call(member, "remote-sync", memberLease.leaseId)).rejects.toThrow(
    /^DOCUMENT_CLOSED: /
  );
  await unshare(member, memberLease.leaseId, "detach");
  expect(call(member, "share-status", "B", memberLease.identity.documentId).binding).toBeNull();
  const kept = await call(member, "open", "B", firstPage(member), "member-2");
  // 作者未同步就结束的编辑不会出现在成员副本里，成员自己的已确认编辑保留。
  expect(localTitle(member, kept.leaseId)).toBe("看板·成员");
  expect(isShared(member, kept.leaseId)).toBe(false);

  const republish = call(owner, "publish", local.leaseId, {
    operationId: "share-again",
    serverUrl: URL,
    pageIds,
  });
  await acknowledgeDrains(owner);
  const second = await republish;
  expect(second.documentId).not.toBe(room.documentId);
  expect(server.store.document(second.documentId).status).toBe("active");
  expect(server.store.document(room.documentId).status).toBe("closed");
});

it("成员退出前补交本机编辑，退出后作者房间保留其改动，成员留下本机白板", async () => {
  const owner = await side("作者", 1, "A");
  const { room } = await sharedBoard(owner);
  const { member, lease } = await joinMember(owner, room.documentId);
  await edit(member, lease.leaseId, "·退出前");
  await unshare(member, lease.leaseId, "leave");
  expect(remoteTitle(room.documentId)).toBe("看板·退出前");
  expect(() => server.store.authorize(room.documentId, member.device.id)).toThrow();
  expect(server.store.document(room.documentId).status).toBe("active");
  const kept = await call(member, "open", "B", firstPage(member), "member-2");
  expect(localTitle(member, kept.leaseId)).toBe("看板·退出前");
  expect(isShared(member, kept.leaseId)).toBe(false);
});

it("同一代次被拒的改动暂停同步，重开不覆盖本机副本", async () => {
  const owner = await side("作者", 1, "A");
  const { created } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "owner-2");
  await call(owner, "remote-open", lease.leaseId, URL);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, call(owner, "snapshot", lease.leaseId).state);
  const vector = Y.encodeStateVector(doc);
  doc.getMap("illegal").set("x", 1);
  const illegal = Y.encodeStateAsUpdate(doc, vector);
  doc.destroy();
  await call(owner, "append", lease.leaseId, "illegal", illegal);
  await expect(call(owner, "remote-sync", lease.leaseId)).rejects.toThrow(/^BRANCH_RETAINED: /);
  expect(await call(owner, "remote-sync", lease.leaseId)).toMatchObject({
    requiresRebind: true,
    reason: "rejected",
  });
  await call(owner, "release", lease.leaseId);
  const reopened = await call(owner, "open", "A", created.contentIds[0], "owner-3");
  expect(await call(owner, "remote-open", reopened.leaseId, URL)).toMatchObject({
    requiresRebind: true,
    reason: "rejected",
  });
  expect(owner.handlers.has("whiteboard-document:adopt")).toBe(false);
});

it("轮询远端未变化时只读确认摘要，不下载完整状态", async () => {
  const owner = await side("作者", 1, "A");
  const { created } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "owner-2");
  await call(owner, "remote-open", lease.leaseId, URL);
  await call(owner, "remote-sync", lease.leaseId);
  const request = vi.spyOn(state.client, "request");
  await call(owner, "remote-sync", lease.leaseId);
  const paths = request.mock.calls.map(args => String(args[1]));
  expect(paths.some(path => path.endsWith("/protocol"))).toBe(true);
  expect(paths.some(path => path.endsWith("/state"))).toBe(false);
});

it.each(["command", "reopen"] as const)(
  "结束共享写入失败后 %s 复用原候选，超过旧升级期限仍可完成",
  async retry => {
    const owner = await side("作者", 1, "A");
    const { created, room } = await sharedBoard(owner);
    const lease = await call(owner, "open", "A", created.contentIds[0], "owner-unshare");
    await call(owner, "remote-open", lease.leaseId, URL);
    await edit(owner, lease.leaseId, "·保留");
    const installation = (
      owner.module as unknown as {
        installation: { install(...args: unknown[]): Promise<unknown> };
      }
    ).installation;
    const install = vi.spyOn(installation, "install").mockRejectedValueOnce(new Error("disk full"));
    await expect(unshare(owner, lease.leaseId, "close", "finish-share")).rejects.toThrow(
      "disk full"
    );
    expect(
      server.store.db.prepare("SELECT status FROM documents WHERE id=?").get(room.documentId)
    ).toEqual({ status: "closed" });
    const candidate = owner.store.db
      .prepare("SELECT record FROM migrations WHERE operation_id=?")
      .get("finish-share") as { record: string };
    const later = Date.now() + 20 * 60_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(later);
    try {
      if (retry === "command") {
        await expect(
          call(owner, "unshare", lease.leaseId, { operationId: "finish-share", mode: "close" })
        ).resolves.toEqual({ missing: 0 });
      } else {
        await call(owner, "open", "A", created.contentIds[0], "retry-unshare");
      }
      const completed = owner.store.db
        .prepare("SELECT record FROM migrations WHERE operation_id=?")
        .get("finish-share") as { record: string };
      expect(JSON.parse(completed.record).plan.fingerprint.candidateHash).toBe(
        JSON.parse(candidate.record).plan.fingerprint.candidateHash
      );
      expect(JSON.parse(completed.record).plan.prepared.candidate).toBe("");
      const opened = await call(owner, "open", "A", created.contentIds[0], "after-unshare");
      expect(isShared(owner, opened.leaseId)).toBe(false);
      expect(localTitle(owner, opened.leaseId)).toContain("保留");
    } finally {
      now.mockRestore();
      install.mockRestore();
    }
  }
);

async function localBoard(owner: Side, id: string) {
  const doc = new Y.Doc();
  const model = new WhiteboardModel(doc);
  model.submit([{ type: "create_page", title: id }], null);
  const created = await call(
    owner,
    "create",
    owner.database,
    id,
    Y.encodeStateAsUpdate(doc),
    "board"
  );
  const pageIds = model.read().pages.map(page => page.id);
  model.dispose();
  doc.destroy();
  return { created, pageIds };
}
it("退出请求响应丢失后保持冻结，按原修订重试关闭而不覆盖输入", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "editing");
  const original = state.client.request.bind(state.client);
  let lost = false;
  const request = vi
    .spyOn(state.client, "request")
    .mockImplementation(async (...args: unknown[]) => {
      const result = await original(...args);
      if (!lost && String(args[1]).endsWith("/close")) {
        lost = true;
        throw new TypeError("lost response");
      }
      return result;
    });
  try {
    const closing = call(owner, "unshare", lease.leaseId, {
      operationId: "lost-close",
      mode: "close",
    });
    const rejected = expect(closing).rejects.toThrow("OFFLINE");
    await acknowledgeDrains(owner);
    await rejected;
    expect(server.store.document(room.documentId).status).toBe("closed");
    await expect(edit(owner, lease.leaseId, "不能放行")).rejects.toThrow();
    await call(owner, "unshare-resume", "A", created.documentId);
    const next = await call(owner, "open", "A", created.contentIds[0], "after-close");
    expect(isShared(owner, next.leaseId)).toBe(false);
    expect(localTitle(owner, next.leaseId)).toBe("看板");
  } finally {
    request.mockRestore();
  }
});

it("退出任务首次落盘失败时不关闭远端，原白板可继续编辑", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "editing");
  const original = owner.store.set.bind(owner.store);
  const save = vi.spyOn(owner.store, "set").mockImplementation((key, value) => {
    if (key.startsWith("whiteboard-unshare:")) throw new Error("disk full");
    original(key, value);
  });
  try {
    const closing = call(owner, "unshare", lease.leaseId, {
      operationId: "save-failed",
      mode: "close",
    });
    const rejected = expect(closing).rejects.toThrow("disk full");
    await acknowledgeDrains(owner);
    await rejected;
    expect(server.store.document(room.documentId).status).toBe("active");
    await edit(owner, lease.leaseId, "保留编辑");
    expect(localTitle(owner, lease.leaseId)).toContain("保留编辑");
  } finally {
    save.mockRestore();
  }
});

it("服务端关闭成功后记录回执失败，原任务继续阻止编辑并可续做", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "editing");
  const original = owner.store.set.bind(owner.store);
  const save = vi.spyOn(owner.store, "set").mockImplementation((key, value) => {
    if (key.startsWith("whiteboard-unshare:") && (value as { remoteDone?: boolean }).remoteDone)
      throw new Error("receipt disk full");
    original(key, value);
  });
  try {
    const closing = call(owner, "unshare", lease.leaseId, {
      operationId: "receipt-failed",
      mode: "close",
    });
    const rejected = expect(closing).rejects.toThrow("receipt disk full");
    await acknowledgeDrains(owner);
    await rejected;
    expect(server.store.document(room.documentId).status).toBe("closed");
    await expect(edit(owner, lease.leaseId, "不能写入")).rejects.toThrow();
  } finally {
    save.mockRestore();
  }
  await call(owner, "unshare-resume", "A", created.documentId);
  const reopened = await call(owner, "open", "A", created.contentIds[0], "after-retry");
  expect(localTitle(owner, reopened.leaseId)).toBe("看板");
});
it("A 发布失败只冻结 A，同库其他白板可打开和创建", async () => {
  const owner = await side("作者", 1, "A");
  const first = await localBoard(owner, "first");
  const second = await localBoard(owner, "second");
  const lease = await call(owner, "open", "A", first.created.contentIds[0], "first-view");
  offline = true;
  const publishing = call(owner, "publish", lease.leaseId, {
    operationId: "offline-publish",
    serverUrl: URL,
    pageIds: first.pageIds,
  });
  const failed = expect(publishing).rejects.toThrow("OFFLINE");
  await acknowledgeDrains(owner);
  await failed;
  await expect(
    call(owner, "open", "A", second.created.contentIds[0], "second-view")
  ).resolves.toMatchObject({ identity: { documentId: "second" } });
  await expect(localBoard(owner, "third")).resolves.toBeDefined();
  state.windowToDatabase.set(2, "A");
  await expect(
    call({ ...owner, window: 2 }, "open", "A", second.created.contentIds[0], "other-window")
  ).resolves.toMatchObject({ identity: { documentId: "second" } });
});
it.each(["resume", "reopen"] as const)(
  "结束共享准备失败后禁止旧输入，%s 继续固定候选",
  async retry => {
    const owner = await side("作者", 1, "A");
    const { created, room } = await sharedBoard(owner);
    const lease = await call(owner, "open", "A", created.contentIds[0], "editing");
    await call(owner, "remote-open", lease.leaseId, URL);
    const installation = (owner.module as any).installation;
    const prepare = vi
      .spyOn(installation, "prepare")
      .mockRejectedValueOnce(new Error("disk full before prepare"));
    const closing = call(owner, "unshare", lease.leaseId, {
      operationId: "close-probe",
      mode: "close",
    });
    const failed = expect(closing).rejects.toThrow("disk full before prepare");
    await acknowledgeDrains(owner);
    await failed;
    prepare.mockRestore();
    expect(server.store.document(room.documentId).status).toBe("closed");
    expect(owner.store.get(`whiteboard-unshare:A:${created.documentId}`, null)).toMatchObject({
      remoteDone: true,
    });
    await expect(edit(owner, lease.leaseId, "失败后新编辑")).rejects.toThrow();
    expect(call(owner, "share-status", "A", created.documentId).unshare).toMatchObject({
      operationId: "close-probe",
    });
    if (retry === "resume") await call(owner, "unshare-resume", "A", created.documentId);
    else await call(owner, "open", "A", created.contentIds[0], "resume-by-open");
    const reopened = await call(owner, "open", "A", created.contentIds[0], "reopened");
    expect(localTitle(owner, reopened.leaseId)).not.toContain("失败后新编辑");
  }
);
it("全部本机租约释放后驱逐远端内存会话，磁盘分支仍保留", async () => {
  const owner = await side("作者", 1, "A");
  const { created } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "editing");
  await call(owner, "remote-open", lease.leaseId, URL);
  await call(owner, "release", lease.leaseId);
  expect((owner.module as any).sessions.holders()).toHaveLength(0);
  expect((owner.module as any).remoteViews.size).toBe(0);
  expect(owner.module.remote.size).toBe(0);
  expect(
    (owner.module as any).journal.db.prepare("SELECT count(*) AS n FROM remote_branches").get()
  ).toEqual({ n: 1 });
});

it("最后一个视图关闭时在途同步继续持有远端会话，结束后再驱逐", async () => {
  const owner = await side("作者", 1, "A");
  const { created } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "editing");
  await call(owner, "remote-open", lease.leaseId, URL);
  const session = await [...owner.module.remote.values()][0];
  let finish!: () => void;
  const synchronize = vi.spyOn(session, "synchronize").mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  const syncing = call(owner, "remote-sync", lease.leaseId);
  const rejected = expect(syncing).rejects.toThrow("失效");
  await vi.waitFor(() => expect(synchronize).toHaveBeenCalled());
  await call(owner, "release", lease.leaseId);
  expect(owner.module.remote.size).toBe(1);
  finish();
  await rejected;
  await vi.waitFor(() => expect(owner.module.remote.size).toBe(0));
  synchronize.mockRestore();
});
