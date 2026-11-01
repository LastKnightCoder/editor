// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { createNodeDocument, NodeTree, readNodeDocument } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import {
  prepareDeviceDocument,
  restoreDeviceDocument,
} from "@tau/collaboration/src/device-sync/documents";
import { DeviceSyncEngine } from "@tau/collaboration/src/device-sync/engine";
import SQL from "@tau/db-schema/schema/device-sync.sql?raw";
import { ensureMainSchema } from "../../main-schema";
import {
  DeviceDatabaseStore,
  deviceDocument,
  deviceGeneration,
  initializeDeviceSyncDatabase,
  writeDeviceDocument,
} from "../database-store";
import { persistDeviceContent, projectDeviceDocument } from "../content-state";
import { DeviceSyncServer } from "../server";
import { DeviceAssetStore } from "../asset-store";
import { parseDevicePairCode } from "../transport";
import { DeviceSyncModule } from "../index";
import collaboration from "../../collaboration";

const host = vi.hoisted(() => ({
  dir: "",
  handlers: new Map<string, (...args: any[]) => any>(),
  databases: new Map<string, any>(),
  windowToDatabase: new Map<number, string>(),
  connected: undefined as undefined | ((name: string) => void),
  events: [] as string[],
  windows: [] as any[],
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => any) => host.handlers.set(name, handler),
  },
  BrowserWindow: { fromWebContents: () => host.windows[0], getAllWindows: () => host.windows },
  app: { on: vi.fn() },
  powerMonitor: { on: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
}));
vi.mock("../../../utils/PathUtil", () => ({ default: { getAppDir: () => host.dir } }));
vi.mock("../../database", () => ({
  default: {
    databases: host.databases,
    windowToDatabase: host.windowToDatabase,
    getDatabase: (name: string) => host.databases.get(name),
    getCurrentDatabaseName: () => host.windowToDatabase.get(1),
    onDatabaseConnected: (callback: (name: string) => void) => {
      host.connected = callback;
    },
    notifyExternalWrite: vi.fn(),
    closeForSync: async (name: string, install?: () => Promise<void>) => {
      host.events.push("close");
      host.databases.get(name)?.close();
      host.databases.delete(name);
      for (const [id, value] of host.windowToDatabase)
        if (value === name) host.windowToDatabase.delete(id);
      await install?.();
    },
    reconnectForSync: async (name: string) => {
      host.events.push("reconnect");
      const { default: SQLite } = await import("better-sqlite3");
      host.databases.set(name, new SQLite(join(host.dir, name)));
      host.connected?.(name);
    },
  },
}));
vi.mock("../../collaboration", () => ({
  default: {
    prepareDeviceDocuments: async () => {},
    receiveDeviceDocuments: vi.fn(),
    releaseLibrary: async () => {
      host.events.push("content-cache");
    },
  },
}));
vi.mock("../../whiteboard-documents", () => ({
  default: {
    releaseLibrary: () => host.events.push("whiteboard-cache"),
    prepareDeviceSync: async () => ({ commit() {}, rollback() {} }),
  },
}));
vi.mock("../../main-content-index-db", () => ({
  default: { resetDatabase: () => host.events.push("index") },
}));
vi.mock("../../pi-session-host", () => ({
  default: { acquireLibrary: async () => () => host.events.push("unlock") },
}));

const cleanup: (() => Promise<void> | void)[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const run of cleanup.splice(0).reverse()) await run();
  for (const db of host.databases.values()) if (db.open) db.close();
  host.databases.clear();
  host.windowToDatabase.clear();
  host.handlers.clear();
  host.windows = [];
  host.events = [];
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const body = (db: Database.Database) => {
  const doc = restoreDeviceDocument(deviceDocument(db, 1)!);
  try {
    return JSON.stringify(readNodeDocument(doc).content);
  } finally {
    doc.destroy();
  }
};
const edit = (db: Database.Database, word: string) => {
  const doc = restoreDeviceDocument(deviceDocument(db, 1)!),
    tree = new NodeTree(doc);
  try {
    tree.insertText("p", 0, word, {});
    persistDeviceContent(db, 1, doc, () => null);
  } finally {
    tree.dispose();
    doc.destroy();
  }
};
const until = async (check: () => boolean) => {
  const end = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > end) throw new Error("桌面接入超时");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

it("并发开启只准备一次，暂停恢复保留尚无同步修订的身份", async () => {
  const root = mkdtempSync(join(tmpdir(), "tau-desktop-coordinator-"));
  roots.push(root);
  host.dir = root;
  const db = new Database(join(root, "data.db"));
  ensureMainSchema(db);
  initializeDeviceSyncDatabase(db, SQL);
  host.databases.set("data.db", db);
  host.windowToDatabase.set(1, "data.db");
  host.windows = [{ id: 1 }];
  vi.spyOn(globalThis, "setInterval").mockImplementation((() => ({ unref() {} })) as any);
  const listen = DeviceSyncServer.prototype.listen;
  const listening = vi.spyOn(DeviceSyncServer.prototype, "listen").mockImplementation(function (
    this: DeviceSyncServer
  ) {
    return listen.call(this, 0);
  });
  let release = () => {};
  const waiting = new Promise<void>(resolve => {
    release = resolve;
  });
  const preparing = vi
    .spyOn(collaboration, "prepareDeviceDocuments")
    .mockImplementationOnce(async (_name, progress) => {
      progress?.(0, 1);
      await waiting;
    });
  const module = new DeviceSyncModule();
  cleanup.push(() => (module as unknown as { server?: DeviceSyncServer }).server?.close());
  await module.init();
  const invoke = (name: string) => host.handlers.get(`device-sync:${name}`)!({ sender: {} });
  const first = invoke("enable"),
    second = invoke("enable");
  try {
    await until(() => preparing.mock.calls.length > 0);
    expect(preparing).toHaveBeenCalledTimes(1);
    expect(invoke("status")).toMatchObject({
      enabled: false,
      preparation: { completed: 0, total: 1 },
    });
  } finally {
    release();
  }
  await Promise.all([first, second]);
  expect(preparing).toHaveBeenCalledTimes(1);
  expect(listening).toHaveBeenCalledTimes(1);
  expect(invoke("status")).toMatchObject({ enabled: true, preparation: undefined });
  const before = db.prepare("SELECT payload FROM _tau_device_state WHERE id=1").get();
  expect(JSON.parse((before as { payload: string }).payload).revision).toBe(0);
  await invoke("pause");
  await invoke("enable");
  expect(invoke("status")).toMatchObject({ enabled: true, preparation: undefined });
  expect(db.prepare("SELECT payload FROM _tau_device_state WHERE id=1").get()).toEqual(before);
});

it("桌面生产处理器编排：配对副本、自动补齐、暂停恢复、同源重配、覆盖及失败后编辑", async () => {
  const root = mkdtempSync(join(tmpdir(), "tau-desktop-replica-"));
  roots.push(root);
  host.dir = join(root, "desktop");
  mkdirSync(host.dir);
  const origin = new Database(join(host.dir, "origin.db"));
  ensureMainSchema(origin);
  initializeDeviceSyncDatabase(origin, SQL);
  origin.exec("INSERT INTO home_panel_layout VALUES('other-library',0,0,1)");
  host.databases.set("origin.db", origin);
  host.windowToDatabase.set(1, "origin.db");
  host.windowToDatabase.set(2, "origin.db");
  host.windows = [1, 2].map(id => ({
    id,
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: vi.fn(),
      reload: vi.fn(() => host.events.push(`reload-${id}`)),
    },
  }));
  const source = new Database(join(root, "coordinator.db"));
  cleanup.push(() => {
    source.close();
  });
  ensureMainSchema(source);
  initializeDeviceSyncDatabase(source, SQL);
  const contract = await prepareContentContract("tau.editor", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const identity = { documentId: randomUUID(), baselineId: randomUUID(), epoch: 0 };
  const doc = await createNodeDocument(
    identity,
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        {
          type: "paragraph",
          collabId: "p",
          tauContract: contract.id,
          children: [{ text: "共同基线" }],
        },
      ],
    },
    { [contract.id]: contract.contract }
  );
  const prepared = await prepareDeviceDocument({
    contentId: 1,
    ...identity,
    state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    paths: {},
    updatedAt: 1000,
  });
  doc.destroy();
  const node = randomUUID(),
    head = randomUUID(),
    library = randomUUID();
  const state = {
    library,
    schema: (
      source.prepare("SELECT value FROM schema_meta WHERE key='main_schema_hash'").get() as {
        value: string;
      }
    ).value,
    node,
    authority: node,
    epoch: randomUUID(),
    head,
    ackHead: head,
    ackSeq: 0,
    enabled: true,
    revision: 0,
  };
  source.prepare("INSERT INTO library_identity VALUES(1,?,?,NULL,1000)").run(library, randomUUID());
  source
    .prepare(
      "INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,1000,1000,?,4,1)"
    )
    .run(prepared.projection.contentJson);
  source
    .prepare(
      "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES(1,?,2,?,'initial')"
    )
    .run(identity.documentId, prepared.projection.contractsJson);
  source.exec("INSERT INTO cards(id,create_time,update_time,content_id) VALUES(1,1000,1000,1)");
  writeDeviceDocument(source, prepared);
  source
    .prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)")
    .run(JSON.stringify(state));
  initializeDeviceSyncDatabase(source, SQL);
  const engine = new DeviceSyncEngine(
    new DeviceDatabaseStore(source, (document, settings) =>
      projectDeviceDocument(source, document, settings)
    )
  );
  let server = new DeviceSyncServer(
    join(root, "server"),
    engine,
    new DeviceAssetStore(join(root, "resources")),
    async () => {},
    () => {}
  );
  cleanup.push(() => server.close());
  await server.listen(0);
  const pairCode = async () => {
    const code = parseDevicePairCode((await server.pairingCode()).code);
    return `tau-pair:v1:${Buffer.from(JSON.stringify({ ...code, addresses: ["127.0.0.1"] })).toString("base64url")}`;
  };
  vi.spyOn(globalThis, "setInterval").mockImplementation((() => ({ unref() {} })) as any);
  const module = new DeviceSyncModule();
  cleanup.push(() => (module as any).client?.stop());
  await module.init();
  const event = { sender: {} },
    invoke = (name: string, ...args: unknown[]) =>
      host.handlers.get(`device-sync:${name}`)!(event, ...args);
  const paired = await invoke("pair", await pairCode());
  expect(paired.database).not.toBe("origin.db");
  const name = paired.database;
  let db = new Database(join(host.dir, name));
  host.databases.set(name, db);
  host.windowToDatabase.set(1, name);
  host.connected?.(name);
  await until(() => invoke("status").phase === "synced");
  expect(invoke("status")).toMatchObject({ role: "replica", enabled: true, peers: [] });
  await invoke("pause");
  edit(db, "本机离线");
  edit(source, "协调端离线");
  await invoke("enable");
  await until(() => body(db).includes("协调端离线") && body(source).includes("本机离线"));
  await invoke("pause");
  edit(db, "重配保留");
  const again = await invoke("pair", await pairCode());
  expect(again).toEqual({ database: name, existing: true });
  expect(body(db)).toContain("重配保留");
  await invoke("sync");
  expect(body(source)).toContain("重配保留");

  await invoke("pause");
  edit(db, "下载失败前输入");
  const generation = deviceGeneration(db);
  const port = (module as any).peer().port;
  await server.close();
  await invoke("enable");
  await expect(invoke("download")).rejects.toThrow(/OFFLINE/);
  expect(db.open).toBe(true);
  edit(db, "下载失败后可编辑");
  server = new DeviceSyncServer(
    join(root, "server"),
    engine,
    new DeviceAssetStore(join(root, "resources")),
    async () => {},
    () => {}
  );
  await server.listen(port);
  await until(
    () => body(source).includes("下载失败后可编辑") && invoke("status").phase === "synced"
  );
  await invoke("pause");
  edit(db, "应丢弃输入");
  const invalid = structuredClone(await engine.download((module as any).peer().node));
  invalid.snapshot!.rows.contents[0].create_time = null;
  vi.spyOn(engine, "download").mockResolvedValueOnce(invalid);
  await invoke("enable");
  await expect(invoke("download")).rejects.toThrow(/NOT NULL/);
  expect(db.open).toBe(false);
  db = host.databases.get(name);
  expect(body(db)).toContain("应丢弃输入");
  expect(deviceGeneration(db)).toBe(generation);
  host.windowToDatabase.set(1, name);
  await invoke("pause");
  edit(db, "安装失败后可编辑");
  await invoke("enable");
  await invoke("download");
  const current = host.databases.get(name);
  expect(db.open).toBe(false);
  expect(deviceGeneration(current)).not.toBe(generation);
  expect(body(current)).toBe(body(source));
  expect(body(current)).not.toContain("应丢弃输入");
  expect(host.events).toEqual(
    expect.arrayContaining([
      "close",
      "content-cache",
      "whiteboard-cache",
      "index",
      "reconnect",
      "reload-1",
    ])
  );
  expect(host.events).not.toContain("reload-2");
  expect(origin.open).toBe(true);
  expect(origin.prepare("SELECT panel_id FROM home_panel_layout").get()).toEqual({
    panel_id: "other-library",
  });
  expect(() => db.prepare("UPDATE contents SET count=0 WHERE id=1")).toThrow();
  expect(() => invoke("status")).toThrow(/尚未就绪/);
  host.windowToDatabase.set(1, name);
  edit(current, "新会话可编辑");
  await invoke("sync");
  expect(body(source)).toContain("新会话可编辑");
}, 20_000);
