// @vitest-environment node
import Database from "better-sqlite3";
import * as Y from "yjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import schema from "@tau/db-schema/schema/main.sql?raw";
import {
  WhiteboardModel,
  createWhiteboardDocument,
  type DocumentSyncSession,
} from "@tau/collaboration";
import { CollaborationAssetService } from "../../collaboration/asset-service";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { ContentLocalState } from "../../collaboration/content-local-state";
import { ContentRecoveryStore } from "../../collaboration/content-recovery";
import { ContentIdentityTable } from "../../tables/content-identity";
import { createServer } from "../../../../../../collaboration-server/src/server";

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
    documentMigration: () => ({
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
    canonicalUrl: (url: string) => url,
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
  module: { remote: Map<string, Promise<DocumentSyncSession>> };
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
  await call(owner, "remote-stage", lease.leaseId, orphan);
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

it("远端换代后旧代次编辑不重投，采用新版本后旧日志保留并恢复同步", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "owner-2");
  await call(owner, "remote-open", lease.leaseId, URL);
  await edit(owner, lease.leaseId, "·旧代次");
  server.store.migrations.begin(room.documentId, {
    id: "epoch",
    actorId: owner.device.id,
    expectedEpoch: 0,
    expiresAt: Date.now() + 60_000,
  });
  const frozen = server.store.migrations.freeze(room.documentId, "epoch", owner.device.id);
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
  const candidate = Y.encodeStateAsUpdate(next);
  await server.store.commitMigration(
    room.documentId,
    owner.device.id,
    "epoch",
    {
      expectedRevision: frozen.frozenRevision!,
      candidateHash: createHash("sha256").update(candidate).digest("hex"),
      targetVersion: 3,
      baselineId: "next",
    },
    candidate
  );
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
  const adopting = call(owner, "adopt", lease.leaseId, { operationId: "adopt-1", serverUrl: URL });
  await acknowledgeDrains(owner);
  await adopting;
  const reopened = await call(owner, "open", "A", created.contentIds[0], "owner-3");
  expect(localTitle(owner, reopened.leaseId)).toBe("新代次");
  expect(await call(owner, "remote-open", reopened.leaseId, URL)).toMatchObject({
    requiresRebind: false,
  });
  await edit(owner, reopened.leaseId, "·继续");
  await call(owner, "remote-sync", reopened.leaseId);
  expect(remoteTitle(room.documentId)).toBe("新代次·继续");
  // 旧代次的本机修订仍在原日志中，没有被清除或混入新代次。
  const { WhiteboardJournal, journalKey } = await import("../journal");
  const journal = new WhiteboardJournal(join(owner.dir, "whiteboard-documents", "journal.db"));
  try {
    const old = journal.load(journalKey(before.identity));
    expect(old?.hash).toBe(createHash("sha256").update(before.state).digest("hex"));
  } finally {
    journal.close();
  }
});

it("旧白板显式转换：安装失败保留原内容，按原操作续做，缺失插件数据保真", async () => {
  const owner = await side("作者", 1, "A");
  owner.db
    .prepare(
      "INSERT INTO white_board_contents(id,create_time,update_time,name,data,ref_count) VALUES(900,1,1,'旧页',?,1)"
    )
    .run(
      JSON.stringify({
        children: [
          {
            id: "kept",
            type: "missing.plugin",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            rotation: 0,
            data: { secret: "原样保留" },
          },
        ],
      })
    );
  const original = owner.db.prepare("SELECT data FROM white_board_contents WHERE id=900").get();
  owner.db.exec(
    "CREATE TEMP TRIGGER fail_install BEFORE INSERT ON whiteboard_documents BEGIN SELECT RAISE(ABORT, 'disk full'); END"
  );
  await expect(call(owner, "legacy-convert", "A", 900, {})).rejects.toThrow("disk full");
  expect(owner.db.prepare("SELECT data FROM white_board_contents WHERE id=900").get()).toEqual(
    original
  );
  const operation = owner.store.get<string | null>(
    "whiteboard-legacy-operation:A:page:900:1",
    null
  );
  expect(operation).toMatch(/^legacy-/);
  owner.db.exec("DROP TRIGGER fail_install");
  const { documentId } = await call(owner, "legacy-convert", "A", 900, {});
  expect(new ContentLocalState(owner.store.db).migration(operation!)?.phase).toBe("COMPLETE");
  const lease = await call(owner, "open", "A", 900, "converted");
  expect(lease.identity.documentId).toBe(documentId);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, lease.state);
  const converted = new WhiteboardModel(doc);
  expect(JSON.stringify(converted.read())).toContain("原样保留");
  converted.dispose();
  doc.destroy();
  expect(await call(owner, "legacy-convert", "A", 900, {})).toEqual({ documentId });
});

it("首次升级并重开旧文字与无标签箭头，保留原正文及其引用计数", async () => {
  const owner = await side("作者", 1, "A");
  const remoteImage = "https://example.com/not-cached.png";
  owner.db
    .prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(701,1,2,?,2,2)"
    )
    .run(JSON.stringify([{ type: "paragraph", children: [{ text: "原文" }] }]));
  const before = owner.db.prepare("SELECT * FROM contents WHERE id=701").get();
  ContentIdentityTable.reference(owner.db, "content", 701);
  const geometry = { x: 10, y: 20, width: 100, height: 60, rotation: 0 };
  owner.db
    .prepare(
      "INSERT INTO white_board_contents(id,create_time,update_time,name,data,ref_count) VALUES(900,1,1,'旧页',?,1)"
    )
    .run(
      JSON.stringify({
        children: [
          {
            ...geometry,
            id: "text",
            type: "richtext",
            contentId: 701,
            content: [{ type: "paragraph", children: [{ text: "旧缓存" }] }],
          },
          {
            ...geometry,
            id: "arrow",
            type: "arrow",
            source: { bindId: "text" },
            target: {},
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 60 },
            ],
          },
          { ...geometry, id: "image", type: "image", src: remoteImage },
        ],
      })
    );
  await call(owner, "legacy-convert", "A", 900, {});
  const lease = await call(owner, "open", "A", 900, "first-upgrade");
  const doc = new Y.Doc();
  Y.applyUpdate(doc, lease.state);
  const model = new WhiteboardModel(doc);
  try {
    const [text, arrow] = model.read().pages[0].children;
    expect(text).toMatchObject({ id: "text", type: "richtext", geometry, body: [] });
    expect(ContentIdentityTable.resolve(owner.db, text.entity!)).toBe(701);
    expect(arrow).toMatchObject({
      id: "arrow",
      type: "arrow",
      body: [],
      data: { source: { bindId: "text" } },
    });
    expect(owner.db.prepare("SELECT * FROM contents WHERE id=701").get()).toEqual(before);
    expect(
      owner.store.get(`legacy-upgrade-issues:A:${lease.identity.documentId}`, null)
    ).toBeNull();
    expect(model.read().pages[0].children[2].data.src).toBe(remoteImage);
    const row = owner.store.db
      .prepare("SELECT record FROM migrations WHERE document_id=?")
      .get(lease.identity.documentId) as { record: string };
    const record = JSON.parse(row.record);
    const recovery = JSON.parse(record.plan.prepared.conversion).recovery;
    const manifest = new ContentRecoveryStore(
      join(owner.dir, "collaboration"),
      new ContentLocalState(owner.store.db)
    ).verify(recovery);
    expect(manifest.missing).toContain(remoteImage);
  } finally {
    model.dispose();
    doc.destroy();
  }
});

it.each([false, true])(
  "普通转换入口补齐旧库身份（已有部分身份=%s），失败不改原库",
  async partial => {
    const owner = await side("作者", 1, "A");
    if (!partial) owner.db.exec("DELETE FROM entity_identities; DELETE FROM library_identity");
    owner.db
      .prepare(
        "INSERT INTO white_board_contents(id,create_time,update_time,name,data,ref_count) VALUES (901,1,1,'旧页',?,1)"
      )
      .run(JSON.stringify({ children: [] }));
    const originalLibrary = ContentIdentityTable.library(owner.db);
    owner.db.exec(
      "CREATE TEMP TRIGGER fail_install BEFORE INSERT ON whiteboard_documents BEGIN SELECT RAISE(ABORT,'disk full'); END"
    );
    await expect(call(owner, "legacy-convert", "A", 901, {})).rejects.toThrow("disk full");
    expect(ContentIdentityTable.library(owner.db)).toEqual(originalLibrary);
    const migrations = new ContentLocalState(owner.store.db);
    const operation = owner.store.get<string>("whiteboard-legacy-operation:A:page:901:1", "");
    expect(migrations.migration(operation)?.decision).toBeUndefined();
    if (!partial) migrations.decideLocal(operation, "commit");
    owner.db
      .prepare(
        "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(999,1,1,'[]',0,1)"
      )
      .run();
    expect(
      owner.db
        .prepare(
          "SELECT entity_id FROM entity_identities WHERE entity_kind='whiteboard-content' AND local_id=901"
        )
        .get()
    ).toBeUndefined();
    owner.db.exec("DROP TRIGGER fail_install");
    const result = await call(owner, "legacy-convert", "A", 901, {});
    expect(migrations.migration(operation)?.phase).toBe("ABORTED");
    const opened = await call(owner, "open", "A", 901, "converted-first");
    expect(opened.identity.documentId).toBe(result.documentId);
    expect(ContentIdentityTable.library(owner.db)).not.toBeNull();
    expect(await call(owner, "legacy-convert", "A", 901, {})).toEqual(result);
  }
);

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
async function unshare(target: Side, leaseId: string, mode: string, operationId = randomUUID()) {
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
    migration: null,
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

it("同一代次被拒的改动：暂停同步，以协作端版本重建后继续，被拒材料仍留在网络分支", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
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
  // 换代采用不能拿来处理同一代次的被拒分支。
  const wrong = call(owner, "adopt", reopened.leaseId, { operationId: "adopt-x", serverUrl: URL });
  await acknowledgeDrains(owner);
  await expect(wrong).rejects.toThrow("代次未前进");
  const rebuilding = call(owner, "adopt", reopened.leaseId, {
    operationId: "rebuild-1",
    serverUrl: URL,
    rebuild: true,
  });
  await acknowledgeDrains(owner);
  await rebuilding;
  const fresh = await call(owner, "open", "A", created.contentIds[0], "owner-4");
  expect(await call(owner, "remote-open", fresh.leaseId, URL)).toMatchObject({
    requiresRebind: false,
  });
  await edit(owner, fresh.leaseId, "·继续");
  await call(owner, "remote-sync", fresh.leaseId);
  expect(remoteTitle(room.documentId)).toBe("看板·继续");
  const branches = owner.dir;
  const { WhiteboardJournal } = await import("../journal");
  const journal = new WhiteboardJournal(join(branches, "whiteboard-documents", "journal.db"));
  try {
    const rows = journal.db.prepare("SELECT value FROM remote_branches").all() as {
      value: string;
    }[];
    expect(rows.some(row => JSON.parse(row.value).rejected.length === 1)).toBe(true);
  } finally {
    journal.close();
  }
});

it("作者发起插件数据升级：暂停后凭原操作续做，成员随后采用新版本", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const { member, lease: memberLease } = await joinMember(owner, room.documentId);
  const lease = await call(owner, "open", "A", created.contentIds[0], "owner-2");
  const reading = call(owner, "migration-source", lease.leaseId, "upgrade-1", URL);
  await acknowledgeDrains(owner);
  const source = await reading;
  // 冻结来源后中断：白板暂停打开，状态报告待续的升级，并能不经画布读回固定来源。
  expect(call(owner, "share-status", "A", created.documentId).upgrade).toEqual({
    operationId: "upgrade-1",
  });
  await expect(call(owner, "open", "A", created.contentIds[0], "blocked")).rejects.toThrow();
  const stored = call(owner, "migration-source-read", "A", "upgrade-1");
  expect(stored).toEqual({ state: source.state, documentId: created.documentId });
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(stored.state, "base64"));
  const model = new WhiteboardModel(doc);
  const { exportWhiteboardTransfer } = await import("@tau/collaboration");
  const bundle = exportWhiteboardTransfer(model, created.documentId);
  model.dispose();
  doc.destroy();
  await call(owner, "migration-prepare", "A", "upgrade-1", bundle);
  expect((await call(owner, "migration-finish", "A", "upgrade-1")).phase).toBe("COMPLETE");
  expect(call(owner, "share-status", "A", created.documentId)).toMatchObject({
    upgrade: null,
    migration: null,
  });
  expect(server.store.migrations.state(room.documentId).epoch).toBe(1);
  const reopened = await call(owner, "open", "A", created.contentIds[0], "owner-3");
  expect(await call(owner, "remote-open", reopened.leaseId, URL)).toMatchObject({
    requiresRebind: false,
  });
  expect(await call(member, "remote-sync", memberLease.leaseId)).toMatchObject({
    requiresRebind: true,
    reason: "epoch",
  });
});

it("迁移与正常同步复用同一房间会话，未知回执经原身份续做", async () => {
  const owner = await side("作者", 1, "A");
  const { created, room } = await sharedBoard(owner);
  const lease = await call(owner, "open", "A", created.contentIds[0], "owner-upgrade");
  await call(owner, "remote-open", lease.leaseId, URL);
  const remote = await [...owner.module.remote.values()][0];
  const stage = vi.spyOn(remote, "stage");
  await edit(owner, lease.leaseId, "·待迁移编辑");
  const original = state.client.request.bind(state.client);
  let dropped = false;
  vi.spyOn(state.client, "request").mockImplementation(async (...args: any[]) => {
    const result = await original(...args);
    if (!dropped && String(args[1]).includes("/operations/") && args[2] === "POST") {
      dropped = true;
      throw new TypeError("response lost");
    }
    return result;
  });
  const preparing = call(owner, "migration-source", lease.leaseId, "shared-owner", URL);
  const failed = expect(preparing).rejects.toThrow("response lost");
  await acknowledgeDrains(owner);
  await failed;
  expect(stage).toHaveBeenCalledTimes(1);
  const pending = remote.snapshot().pending[0].request.operationId;
  expect(server.store.operations.get(room.documentId, pending, owner.device.id)?.state).toBe(
    "COMMITTED"
  );
  await call(owner, "remote-sync", lease.leaseId);
  expect(remote.snapshot().pending).toHaveLength(0);
  expect(remote.snapshot().receipts.some(receipt => receipt.operationId === pending)).toBe(true);
  await call(owner, "migration-source", lease.leaseId, "shared-owner", URL);
  expect(stage).toHaveBeenCalledTimes(1);
  expect(owner.module.remote.size).toBe(1);
  expect(remoteTitle(room.documentId)).toContain("待迁移编辑");
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
