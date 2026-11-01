import {
  prepareWhiteboardContract,
  prepareContentContract,
} from "@tau/db-schema/content-contracts";
import { ContentLocalState } from "../../collaboration/content-local-state";
import { ContentDocumentTable } from "../../tables/content-document";
// @vitest-environment node
import Database from "better-sqlite3";
import * as Y from "yjs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { WhiteboardModel, createWhiteboardDocument } from "@tau/collaboration";
import { CollaborationAssetService } from "../../collaboration/asset-service";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { ContentIdentityTable } from "../../tables/content-identity";
const state = vi.hoisted(() => ({
  dir: "",
  assets: null as CollaborationAssetService | null,
  assetStore: null as CollaborationLocalStore | null,
  databases: new Map<string, Database.Database>(),
  windowToDatabase: new Map<number, string>(),
  handlers: new Map<string, (...args: any[]) => any>(),
  windows: [] as any[],
  sent: [] as { owner: number; channel: string; data: any }[],
}));
// 此处验证耐久 HTTP 编排；真实推送连接由 realtime.test.ts 覆盖。
vi.mock("../realtime", () => ({
  WhiteboardRealtime: class {
    publishDocument() {}
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
    documentClient: vi.fn(),
    documentStorage: () => {
      const local = new ContentLocalState(state.assetStore!.db);
      return {
        state: local,
        store: state.assetStore,
      };
    },
    documentAssets: () => state.assets,
  },
}));
vi.mock("../../database", () => ({
  default: {
    databases: state.databases,
    windowToDatabase: state.windowToDatabase,
    getDatabase: (name: string) => state.databases.get(name),
    onDatabaseConnected: vi.fn(),
    formatDatabaseName: (name: string) => name.replace(/\.db$/, ""),
  },
}));
vi.mock("../../pi-session-host", () => ({
  default: { acquireLibrary: async () => () => {} },
}));
vi.mock("../../../utils/PathUtil", () => ({ default: { getAppDir: () => state.dir } }));
vi.mock("../../tables/data-table", () => ({
  default: { incrementRefCount: vi.fn(), remove: vi.fn() },
}));
vi.mock("../../tables/white-board-content", () => ({
  default: { incrementRefCount: vi.fn(), deleteWhiteboard: vi.fn() },
}));
let service: { sessions: { dispose(): void; journal: { close(): void } } };
let source: Y.Doc;
beforeEach(async () => {
  vi.resetModules();
  state.dir = mkdtempSync(join(tmpdir(), "whiteboard-ipc-"));
  state.assetStore = new CollaborationLocalStore(join(state.dir, "asset-store"));
  state.assets = new CollaborationAssetService(state.assetStore, state.dir, async () => {
    throw new Error("测试不允许联网");
  });
  state.handlers.clear();
  state.sent = [];
  state.windowToDatabase.clear();
  state.databases.clear();
  const db = new Database(":memory:");
  db.exec(schema);
  ContentIdentityTable.establishBaseline(db);
  state.databases.set("A", db);
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
  state.windowToDatabase.set(1, "A");
  state.windowToDatabase.set(2, "A");
  const module = (await import("../index")).default;
  await module.init();
  service = module as unknown as typeof service;
  source = new Y.Doc();
  const model = new WhiteboardModel(source);
  model.submit([{ type: "create_page", title: "页" }], null);
});
afterEach(() => {
  service?.sessions.dispose();
  service?.sessions.journal.close();
  source?.destroy();
  state.databases.forEach(db => db.close());
  state.assetStore?.db.close();
  rmSync(state.dir, { recursive: true, force: true });
});
const event = (owner: number) => ({ sender: state.windows.find(w => w.id === owner).webContents });
const call = (name: string, owner: number, ...args: unknown[]) =>
  state.handlers.get(`whiteboard-document:${name}`)!(event(owner), ...args);
async function opened() {
  const created = await call("create", 1, "A", "doc", Y.encodeStateAsUpdate(source), "board");
  return Promise.all([
    call("open", 1, "A", created.contentIds[0], "a"),
    call("open", 2, "A", created.contentIds[0], "b"),
  ]);
}
const requests = () => state.sent.filter(event => event.channel === "whiteboard-document:drain");

it("未打开文档的历史持有尚未建立时保守阻止实体回收", async () => {
  const created = await call("create", 1, "A", "doc", Y.encodeStateAsUpdate(source), "board");
  const { hasDurableEntityHold } = await import("../../durable-entity-holds");
  const db = state.databases.get("A")!;
  expect(hasDurableEntityHold(db, "whiteboard-content", 900)).toBe(true);
  await call("open", 1, "A", created.contentIds[0], "a");
  expect(hasDurableEntityHold(db, "whiteboard-content", 900)).toBe(false);
});

it("共享候选按标题检索整块白板，已共享的不再列出", async () => {
  const created = await call("create", 1, "A", "doc", Y.encodeStateAsUpdate(source), "board");
  state.databases
    .get("A")!
    .prepare("UPDATE white_boards SET title=? WHERE id=?")
    .run("产品路线图", created.boardId);
  expect(call("share-candidates", 1, "A", "路线")).toEqual([
    {
      boardId: created.boardId,
      title: "产品路线图",
      documentId: "doc",
      contentId: created.contentIds[0],
      pages: 1,
    },
  ]);
  expect(call("share-candidates", 1, "A", "")).toHaveLength(1);
  // LIKE 通配符按字面匹配
  expect(call("share-candidates", 1, "A", "%")).toEqual([]);
  state.assetStore!.set("whiteboard-binding:A:doc", {
    serverUrl: "https://collab.test",
    documentId: "room",
  });
  expect(call("share-candidates", 1, "A", "路线")).toEqual([]);
});
it("切库屏障阻止新打开，全部持有者确认后才释放旧租约", async () => {
  const [a, b] = await opened();
  const { prepareDurableDocuments } = await import("../../durable-document-lifecycle");
  const pending = prepareDurableDocuments({ databaseName: "A", reason: "database-change" });
  await expect(call("open", 1, "A", 1, "late")).rejects.toThrow("关闭或切库");
  await vi.waitFor(() => expect(requests()).toHaveLength(2));
  for (const request of requests()) await call("drained", request.owner, request.data.requestId);
  const drain = await pending;
  drain.commit();
  expect(() => call("snapshot", 1, a.leaseId)).toThrow("视图不属于");
  expect(() => call("snapshot", 2, b.leaseId)).toThrow("视图不属于");
});
it("一方失败后迟到的另一方成功回执不能再次封住活跃视图", async () => {
  const [, b] = await opened();
  const { prepareDurableDocuments } = await import("../../durable-document-lifecycle");
  const pending = prepareDurableDocuments({ databaseName: "A", reason: "database-change" });
  const failed = expect(pending).rejects.toThrow("DURABLE_DOCUMENT_FAILED: 保存失败");
  await vi.waitFor(() => expect(requests()).toHaveLength(2));
  const [first, second] = requests();
  await call("drained", first.owner, first.data.requestId, "保存失败");
  await failed;
  await call("drained", second.owner, second.data.requestId);
  const client = new Y.Doc();
  Y.applyUpdate(client, b.state);
  const model = new WhiteboardModel(client),
    updates: Uint8Array[] = [];
  client.on("update", update => updates.push(update));
  model.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "继续" } }], {});
  await expect(
    call("append", 2, b.leaseId, "after-cancel", Y.mergeUpdates(updates))
  ).resolves.toMatchObject({ revision: 1 });
  client.destroy();
});
it("窗口不能提交、关闭或确认另一窗口的租约", async () => {
  const [, b] = await opened();
  expect(() => call("release", 1, b.leaseId)).toThrow("不属于");
  const { prepareDurableDocuments } = await import("../../durable-document-lifecycle");
  const pending = prepareDurableDocuments({ windowId: 2, reason: "window-close" });
  await vi.waitFor(() => expect(requests()).toHaveLength(1));
  const request = requests()[0];
  await call("drained", 1, request.data.requestId);
  expect(call("snapshot", 2, b.leaseId).leaseId).toBe(b.leaseId);
  await call("drained", 2, request.data.requestId);
  const drain = await pending;
  drain.rollback();
  expect(call("snapshot", 2, b.leaseId).leaseId).toBe(b.leaseId);
});

it.each([false, true])("设备安装白板后重新打开，失败则恢复原租约（失败=%s）", async fail => {
  const [a] = await opened();
  const { DeviceSyncModule } = await import("../../device-sync");
  const { DeviceDatabaseStore, initializeDeviceSyncDatabase } =
    await import("../../device-sync/database-store");
  const { DeviceSyncEngine, synchronizeDevice } =
    await import("@tau/collaboration/src/device-sync/engine");
  const { WhiteboardDocumentSessions } = await import("../sessions");
  const { WhiteboardJournal } = await import("../journal");
  const { default: sql } = await import("@tau/db-schema/schema/device-sync.sql?raw");
  const db = state.databases.get("A")!;
  const path = join(state.dir, "coordinator.db");
  await db.backup(path);
  const coordinator = new Database(path);
  const journal = new WhiteboardJournal(join(state.dir, "coordinator-journal.db"));
  const sessions = new WhiteboardDocumentSessions(journal, () => coordinator);
  const authority = randomUUID(),
    head = randomUUID();
  const identity = {
    library: ContentIdentityTable.library(db)!.sourceId,
    schema: "whiteboard-test",
    node: authority,
    authority,
    head,
    ackHead: head,
    ackSeq: 0,
    revision: 0,
    epoch: randomUUID(),
    enabled: true,
  };
  for (const [database, node] of [
    [coordinator, authority],
    [db, randomUUID()],
  ] as const) {
    initializeDeviceSyncDatabase(database, sql);
    database
      .prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)")
      .run(JSON.stringify({ ...identity, node }));
    initializeDeviceSyncDatabase(database, sql);
  }
  const module = new DeviceSyncModule();
  const local = new DeviceDatabaseStore(
    db,
    () => {},
    plan =>
      (
        module as unknown as {
          guardCommit(name: string, plan: unknown): Promise<(committed: boolean) => void>;
        }
      ).guardCommit("A", plan)
  );
  const remote = new DeviceSyncEngine(new DeviceDatabaseStore(coordinator, () => {}));
  const model = new WhiteboardModel(new Y.Doc({ gc: false }));
  try {
    await model.receive(a.state);
    const view = await sessions.open("coordinator", 1, 3, "remote");
    const vector = Y.encodeStateVector(model.doc);
    model.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "远端" } }], {});
    await sessions.append(view.leaseId, 3, "remote-edit", Y.encodeStateAsUpdate(model.doc, vector));
    const before = await local.read();
    const pending = fail
      ? local.commit({
          expectedHead: before.state.head,
          expectedSequence: before.sequence,
          expectedGeneration: before.generation,
          state: before.state,
          snapshot: { rows: {}, documents: [] },
        })
      : synchronizeDevice(new DeviceSyncEngine(local), offer => remote.accept(offer));
    const result = fail ? expect(pending).rejects.toThrow("SNAPSHOT_TABLES") : pending;
    await vi.waitFor(() => expect(requests()).toHaveLength(2));
    for (const request of requests()) await call("drained", request.owner, request.data.requestId);
    await result;
    if (fail) {
      expect(call("snapshot", 1, a.leaseId).leaseId).toBe(a.leaseId);
      expect(state.sent.some(event => event.channel === "whiteboard-document:detached")).toBe(
        false
      );
    } else {
      expect(() => call("snapshot", 1, a.leaseId)).toThrow("视图不属于");
      expect(
        state.sent.filter(event => event.channel === "whiteboard-document:detached")
      ).toHaveLength(2);
    }
    const next = fail ? a : await call("open", 1, "A", 1, "a");
    const client = new WhiteboardModel(new Y.Doc({ gc: false }));
    try {
      await client.receive(next.state);
      expect(client.read().title).toBe(fail ? "" : "远端");
      const vector = Y.encodeStateVector(client.doc);
      client.submit([{ type: "edit_title", edit: { offset: 0, remove: 0, text: "继续" } }], {});
      const receipt = await call(
        "append",
        1,
        next.leaseId,
        "after-sync",
        Y.encodeStateAsUpdate(client.doc, vector)
      );
      expect(receipt.error).toBeUndefined();
      await expect(call("flush", 1, next.leaseId)).resolves.toMatchObject({
        revision: receipt.revision,
      });
    } finally {
      client.dispose();
      client.doc.destroy();
    }
  } finally {
    model.dispose();
    model.doc.destroy();
    sessions.dispose();
    journal.close();
    coordinator.close();
  }
});
it("未绑定共享基线的本机白板不能隐式打开远端房间", async () => {
  const [a] = await opened();
  await expect(call("remote-open", 1, a.leaseId, "https://collab.example")).rejects.toThrow(
    "首次发布"
  );
});
it("远端接口复用窗口持有，旧本机代次不能以新代次发送", async () => {
  const doc = await createWhiteboardDocument(
    { documentId: "remote", baselineId: "base", epoch: 0 },
    Y.encodeStateAsUpdate(source)
  );
  const created = await call("create", 1, "A", "local", Y.encodeStateAsUpdate(doc), "board");
  const local = await call("open", 1, "A", created.contentIds[0], "a");
  const client = (await import("../../collaboration")).default.documentClient;
  vi.mocked(client).mockReturnValue({
    serverTime: () => Date.now(),
    identity: async () => ({ id: "actor" }),
  } as any);
  const remote = await import("../remote");
  let epoch = 0;
  const session = {
    snapshot: () => ({
      rejected: [],
      pending: [],
      blocked: false,
      confirmed: {
        state: Y.encodeStateAsUpdate(doc),
        protocol: { id: "remote", baselineId: "base", epoch, version: 3 },
      },
    }),
    stage: vi.fn(async () => "operation"),
    flush: vi.fn(async () => {}),
    synchronize: vi.fn(async () => {}),
  };
  vi.spyOn(remote, "openWhiteboardRemoteSession").mockResolvedValue(session as any);
  try {
    await call("remote-open", 1, local.leaseId, "https://collab.example");
    await expect(call("remote-sync", 2, local.leaseId)).rejects.toThrow("不属于");
    expect(state.handlers.has("whiteboard-document:remote-stage")).toBe(false);
    expect(state.handlers.has("whiteboard-document:remote-cancel")).toBe(false);
    epoch = 1;
    expect((await call("remote-sync", 1, local.leaseId)).requiresRebind).toBe(true);
    expect(session.stage).not.toHaveBeenCalled();
    expect(call("snapshot", 1, local.leaseId).state).toEqual(local.state);
  } finally {
    vi.restoreAllMocks();
    doc.destroy();
  }
});

it("稳定外部引用只解析当前来源，不能误读本机同号实体或跨窗口切库", () => {
  state.databases
    .get("A")!
    .prepare("INSERT INTO articles(id,create_time,update_time,title) VALUES(9,1,1,'文章')")
    .run();
  const reference = call("reference-entity", 1, "A", "article", 9);
  expect(call("resolve-entity", 1, "A", reference)).toBe(9);
  expect(call("resolve-entity", 1, "A", { ...reference, sourceId: "another-source" })).toBeNull();
  state.windowToDatabase.set(2, "B");
  expect(() => call("resolve-entity", 2, "A", reference)).toThrow("旧资料库");
});
it("媒体按文档缓存为不透明引用，错误窗口和已关闭租约不能读取", async () => {
  const created = await call(
    "create",
    1,
    "A",
    "resource-board",
    Y.encodeStateAsUpdate(source),
    "board"
  );
  const view = await call("open", 1, "A", created.contentIds[0], "resource-view");
  const bytes = new Uint8Array([1, 2, 3]);
  const reference = await call("resource-upload", 1, view.leaseId, {
    name: "photo.png",
    mime: "image/png",
    bytes,
  });
  expect(reference).toMatch(/^tau-collab-local:/);
  expect((await call("resource-read", 1, view.leaseId, reference)).bytes).toEqual(bytes);
  await expect(call("resource-read", 2, view.leaseId, reference)).rejects.toThrow("窗口");
  await expect(call("resource-resolve", 1, view.leaseId, "/private/file")).rejects.toThrow(
    "资源标识"
  );
  await call("release", 1, view.leaseId);
  await expect(call("resource-read", 1, view.leaseId, reference)).rejects.toThrow();
});
it("跨文档复制资产重新登记，源不可访问时目标文档保持原样", async () => {
  const first = await call(
    "create",
    1,
    "A",
    "asset-source",
    Y.encodeStateAsUpdate(source),
    "board"
  );
  const second = await call(
    "create",
    1,
    "A",
    "asset-target",
    Y.encodeStateAsUpdate(source),
    "board"
  );
  const left = await call("open", 1, "A", first.contentIds[0], "left");
  const right = await call("open", 1, "A", second.contentIds[0], "right");
  const bytes = new Uint8Array([9, 8, 7]);
  const original = await call("resource-upload", 1, left.leaseId, {
    name: "photo.png",
    mime: "image/png",
    bytes,
  });
  const copy = await call("resource-import", 1, right.leaseId, left.identity.documentId, original);
  expect(copy).not.toBe(original);
  expect((await call("resource-read", 1, right.leaseId, copy)).bytes).toEqual(bytes);
  await expect(call("resource-read", 1, right.leaseId, original)).rejects.toThrow();
  const before = await call("snapshot", 1, right.leaseId);
  await expect(
    call("resource-import", 1, right.leaseId, "unopened-source", original)
  ).rejects.toThrow("有权访问");
  expect((await call("snapshot", 1, right.leaseId)).state).toEqual(before.state);
});

it("显式复制板内正文创建独立身份和契约，不改写原正文或扩大引用权限", async () => {
  const model = new WhiteboardModel(source);
  const contract = await prepareWhiteboardContract("host.whiteboard", {
    type: "richtext",
    dataVersion: 1,
    structure: { text: "richtext" },
  });
  const paragraph = await prepareContentContract("tau.paragraph", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const [id] = model.submit(
    [
      {
        type: "create",
        contractId: contract.id,
        geometry: { x: 0, y: 0, width: 100, height: 60, rotation: 0 },
        data: {},
        body: [{ type: "paragraph", tauContract: paragraph.id, children: [{ text: "板内正文" }] }],
        parent: { kind: "page", id: model.read().pages[0].id },
      },
    ],
    null,
    [contract, paragraph]
  ).createdIds;
  const before = model.read();
  const created = await call("create", 1, "A", "body-copy", Y.encodeStateAsUpdate(source), "board");
  const view = await call("open", 1, "A", created.contentIds[0], "body-view");
  const contentId = await call("copy-content", 1, view.leaseId, id);
  const db = state.databases.get("A")!,
    copy = ContentDocumentTable.read(db, contentId)!;
  expect(copy.content[0].children?.[0].text).toBe("板内正文");
  expect(copy.content[0].collabId).not.toBe(
    (before.pages[0].children[0].body as { collabId: string }[])[0].collabId
  );
  expect(copy.contracts[String(copy.content[0].tauContract)]).toBeTruthy();
  expect(db.prepare("SELECT ref_count FROM contents WHERE id=?").get(contentId)).toEqual({
    ref_count: 0,
  });
  expect(model.read()).toEqual(before);
  model.dispose();
});
