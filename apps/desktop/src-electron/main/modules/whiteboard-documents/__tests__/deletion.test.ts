// @vitest-environment node
import Database from "better-sqlite3";
import * as Y from "yjs";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { WhiteboardModel } from "@tau/collaboration";
import { CollaborationLocalStore } from "../../collaboration/local-store";
import { ContentLocalState } from "../../collaboration/content-local-state";
import { ContentIdentityTable } from "../../tables/content-identity";
import { prepareWhiteboardContract } from "@tau/db-schema/content-contracts";

const host = vi.hoisted(() => ({
  dir: "",
  cache: null as CollaborationLocalStore | null,
  databases: new Map<string, Database.Database>(),
  windowToDatabase: new Map([[1, "A"]]),
  handlers: new Map<string, (...args: any[]) => any>(),
  windows: [] as any[],
}));
vi.mock("electron", () => ({
  app: { on: vi.fn(), getPath: () => "/tmp" },
  ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => host.handlers.set(name, fn) },
  BrowserWindow: {
    getAllWindows: () => host.windows,
    fromId: () => host.windows[0],
    fromWebContents: () => host.windows[0],
  },
}));
vi.mock("../../database", () => ({
  default: {
    ...host,
    getDatabase: (name: string) => host.databases.get(name),
    onDatabaseConnected: vi.fn(),
  },
}));
vi.mock("../../../utils/PathUtil", () => ({ default: { getAppDir: () => host.dir } }));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../../collaboration", () => ({
  default: {
    documentStorage: () => ({ state: new ContentLocalState(host.cache!.db), store: host.cache }),
    documentAssets: () => ({}),
    documentClient: () => ({}),
  },
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach(run => run());
  host.databases.clear();
});
async function fixture() {
  vi.resetModules();
  host.dir = mkdtempSync(join(tmpdir(), "whiteboard-delete-"));
  const directory = host.dir,
    cache = new CollaborationLocalStore(directory);
  host.cache = cache;
  const db = new Database(":memory:");
  db.exec(schema);
  db.pragma("foreign_keys=ON");
  ContentIdentityTable.establishBaseline(db);
  host.databases.set("A", db);
  host.windows = [
    {
      id: 1,
      isDestroyed: () => false,
      once: vi.fn(),
      webContents: {
        isDestroyed: () => false,
        on: vi.fn(),
        send: (channel: string, payload: any) => {
          if (channel === "whiteboard-document:drain")
            queueMicrotask(() =>
              host.handlers.get("whiteboard-document:drained")!(
                { sender: host.windows[0].webContents },
                payload.requestId
              )
            );
        },
      },
    },
  ];
  const service = (await import("../index")).default as any;
  await service.init();
  const table = (await import("../../tables/whiteboard")).default;
  const pages = (await import("../../tables/white-board-content")).default;
  const doc = new Y.Doc(),
    model = new WhiteboardModel(doc);
  db.prepare(
    "INSERT INTO data_tables(id,create_time,update_time,columns,rows,ref_count) VALUES(42,1,1,'[]','[]',0)"
  ).run();
  const reference = ContentIdentityTable.reference(db, "data-table", 42);
  const contract = await prepareWhiteboardContract("example", {
    type: "shape",
    dataVersion: 1,
    structure: { reference: "entity" },
  });
  await model.installContracts({ [contract.id]: contract.contract });
  model.submit(
    [
      { type: "create_page", id: "page", title: "页" },
      {
        type: "create",
        id: "shape",
        contractId: contract.id,
        data: {},
        entity: reference,
        geometry: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
        parent: { kind: "page", id: "page" },
      },
    ],
    null
  );
  const created = await service.sessions.create(
    "A",
    "document",
    Y.encodeStateAsUpdate(doc),
    "board"
  );
  model.dispose();
  doc.destroy();
  cleanup.push(() => {
    service.sessions.dispose();
    service.journal.close();
    db.close();
    cache.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { service, db, cache, table, pages, ...created };
}

it("列表原入口删除拥有者，引用页继续编辑，无引用且过宽限期才整份回收", async () => {
  const f = await fixture();
  f.pages.incrementRefCount(f.db, f.contentIds[0]);
  await f.table.getListenEvents()["delete-white-board"](f.db, f.boardId);
  expect(f.db.prepare("SELECT id FROM white_boards").all()).toEqual([]);
  expect(f.db.prepare("SELECT board_id FROM whiteboard_documents").get()).toEqual({
    board_id: null,
  });
  const view = await f.service.sessions.open("A", f.contentIds[0], 1, "embedded");
  expect(f.service.collectPendingDocuments(f.db, Date.now() + 1000, 1)).toBe(0);
  f.pages.deleteWhiteboard(f.db, f.contentIds[0]);
  expect(f.service.collectPendingDocuments(f.db, Date.now() + 1000, 1)).toBe(0);
  await f.service.sessions.release(view.leaseId, 1);
  expect(f.service.collectPendingDocuments(f.db, Date.now(), 1000)).toBe(0);
  expect(f.service.collectPendingDocuments(f.db, Date.now() + 2000, 1000)).toBe(1);
  expect(f.db.prepare("SELECT * FROM whiteboard_document_pages").all()).toEqual([]);
  expect(f.service.journal.db.prepare("SELECT * FROM documents").all()).toEqual([]);
  expect(f.db.prepare("SELECT ref_count FROM data_tables WHERE id=42").get()).toEqual({
    ref_count: 0,
  });
  f.pages.collectPendingReleases(f.db, { now: Date.now() + 2000, graceMs: 1000 });
  expect(f.db.prepare("SELECT id FROM white_board_contents").all()).toEqual([]);
}, 20_000);

it("共享未结束拒绝删除；删除事务失败恢复拥有者、引用和活跃视图", async () => {
  const f = await fixture();
  f.cache.set("whiteboard-binding:A:document", {
    serverUrl: "https://example.com",
    documentId: "room",
  });
  await expect(f.service.deleteBoard(f.db, f.boardId)).rejects.toThrow("先结束共享");
  f.cache.delete("whiteboard-binding:A:document");
  const view = await f.service.sessions.open("A", f.contentIds[0], 1, "active");
  f.db.exec(
    "CREATE TEMP TRIGGER fail_delete BEFORE DELETE ON white_boards BEGIN SELECT RAISE(ABORT,'disk full'); END"
  );
  await expect(f.service.deleteBoard(f.db, f.boardId)).rejects.toThrow("disk full");
  expect(f.service.sessions.snapshot(view.leaseId, 1).identity.documentId).toBe("document");
  expect(f.db.prepare("SELECT board_id FROM whiteboard_documents").get()).toEqual({
    board_id: f.boardId,
  });
  expect(f.db.prepare("SELECT ref_count FROM white_board_contents").get()).toEqual({
    ref_count: 1,
  });
  f.db.exec("DROP TRIGGER fail_delete");
  await f.service.deleteBoard(f.db, f.boardId);
  expect(f.service.sessions.holders()).toEqual([]);
}, 20_000);

it("回收日志失败回滚主库，原文档和关系保留，重试不重复释放", async () => {
  const f = await fixture();
  const view = await f.service.sessions.open("A", f.contentIds[0], 1, "seed");
  await f.service.sessions.release(view.leaseId, 1);
  await f.service.deleteBoard(f.db, f.boardId);
  f.service.journal.db.exec(
    "CREATE TEMP TRIGGER fail_retire BEFORE DELETE ON documents BEGIN SELECT RAISE(ABORT,'journal failed'); END"
  );
  expect(() => f.service.collectPendingDocuments(f.db, Date.now() + 2000, 1000)).toThrow(
    "journal failed"
  );
  expect(f.db.prepare("SELECT document_id FROM whiteboard_documents").get()).toBeDefined();
  expect(f.db.prepare("SELECT ref_count FROM data_tables WHERE id=42").get()).toEqual({
    ref_count: 1,
  });
  f.service.journal.db.exec("DROP TRIGGER fail_retire");
  expect(f.service.collectPendingDocuments(f.db, Date.now() + 2000, 1000)).toBe(1);
  expect(f.service.collectPendingDocuments(f.db, Date.now() + 2000, 1000)).toBe(0);
}, 20_000);

it("插件原删除入口在同一事务保存操作记录，恢复时重新认领原文档", async () => {
  const f = await fixture();
  const plugin = (await import("../../tables/plugin-data")).default;
  const scope = { databaseName: ":memory:", pluginId: "test.delete" };
  const current = plugin.get(f.db, { ...scope, entity: "whiteboard", id: f.boardId })!;
  await plugin.getListenEvents()["plugin-data:delete"](f.db, {
    ...scope,
    entity: "whiteboard",
    id: f.boardId,
    expectedRevision: current.revision,
  });
  const operation = plugin.operations(f.db, scope)[0];
  expect(operation.entity).toBe("whiteboard");
  const restored = plugin.restore(f.db, { ...scope, id: operation.id }, {
    broadcastAll: vi.fn(),
    broadcastOthers: vi.fn(),
  } as never);
  expect(f.db.prepare("SELECT board_id FROM whiteboard_documents").get()).toEqual({
    board_id: restored.id,
  });
  expect(f.db.prepare("SELECT ref_count FROM white_board_contents").get()).toEqual({
    ref_count: 1,
  });
}, 20_000);

it("删除整板同时释放隐藏页的拥有者引用", async () => {
  const f = await fixture();
  const view = await f.service.sessions.open("A", f.contentIds[0], 1, "edit");
  const doc = new Y.Doc();
  Y.applyUpdate(doc, view.state);
  const vector = Y.encodeStateVector(doc),
    model = new WhiteboardModel(doc);
  model.submit(
    [
      { type: "create_page", id: "hidden", title: "隐藏" },
      { type: "remove_page", id: "hidden", observedElementIds: [] },
    ],
    null
  );
  await f.service.sessions.append(view.leaseId, 1, "hide", Y.encodeStateAsUpdate(doc, vector));
  model.dispose();
  doc.destroy();
  await f.service.sessions.release(view.leaseId, 1);
  await f.service.deleteBoard(f.db, f.boardId);
  expect(f.db.prepare("SELECT ref_count FROM white_board_contents").all()).toEqual([
    { ref_count: 0 },
    { ref_count: 0 },
  ]);
  expect(f.service.collectPendingDocuments(f.db, Date.now() + 2000, 1000)).toBe(1);
}, 20_000);
