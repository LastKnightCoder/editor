import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import Database from "better-sqlite3";
import MAIN_SQL from "@tau/db-schema/schema/main.sql?raw";
import DEVICE_SQL from "@tau/db-schema/schema/device-sync.sql?raw";
import { prepareDeviceDocument } from "@tau/collaboration/src/device-sync/documents";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DeviceSyncEngine } from "@tau/collaboration/src/device-sync/engine";
import database from "../database";
import collaboration from "../collaboration";
import PathUtil from "../../utils/PathUtil";
import { ContentIdentityTable } from "../tables/content-identity";
import { prepareDurableDocuments } from "../durable-document-lifecycle";
import {
  DeviceDatabaseStore,
  readDeviceSyncState,
  initializeDeviceSyncDatabase,
} from "./database-store";
import { projectDeviceDocument } from "./content-state";
import { DeviceAssetStore } from "./asset-store";
import { DeviceSyncServer } from "./server";
import PiSessionHost from "../pi-session-host";
import { parseDeviceState } from "./recovery";

class DeviceSyncModule {
  name = "device-sync";
  private server?: DeviceSyncServer;
  private openedDatabase?: Database.Database;
  private nameOfLibrary?: string;
  private lastSync?: number;
  private error?: string;
  private starting: Promise<void> = Promise.resolve();
  private preparing = new Map<string, Promise<void>>();
  private bootstrapping = new Set<string>();
  private prepare(name: string) {
    const pending = this.preparing.get(name);
    if (pending) return pending;
    const task = collaboration
      .prepareDeviceDocuments(name)
      .finally(() => this.preparing.delete(name));
    this.preparing.set(name, task);
    return task;
  }
  private directory() {
    const path = join(PathUtil.getAppDir(), "device-sync");
    mkdirSync(path, { recursive: true, mode: 0o700 });
    return path;
  }
  private nodeId() {
    const path = join(this.directory(), "node-id");
    if (existsSync(path)) return readFileSync(path, "utf8");
    const id = randomUUID();
    writeFileSync(path, id, { mode: 0o600, flag: "wx" });
    return id;
  }
  private setting() {
    const path = join(this.directory(), "host.json");
    if (!existsSync(path)) return null;
    try {
      const value = JSON.parse(readFileSync(path, "utf8")) as {
        database: string;
        enabled: boolean;
      };
      if (typeof value.database !== "string" || typeof value.enabled !== "boolean")
        throw new Error("同步配置无效");
      return value;
    } catch {
      try {
        renameSync(path, `${path}.damaged-${Date.now()}`);
      } catch {
        /* 只读配置不阻断本机功能。 */
      }
      this.error = "设备同步配置已隔离，本机阅读与编辑不受影响";
      return null;
    }
  }
  private save(name: string, enabled: boolean) {
    const path = join(this.directory(), "host.json");
    writeFileSync(`${path}.tmp`, JSON.stringify({ database: name, enabled }), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  }
  private forEvent(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("窗口已关闭");
    const name = database.windowToDatabase.get(window.id) ?? database.getCurrentDatabaseName();
    const db = database.getDatabase(name);
    if (!db?.open) throw new Error("资料库尚未就绪");
    return { name, db };
  }
  private start(name: string) {
    const task = this.starting.catch(() => {}).then(() => this.startLibrary(name));
    this.starting = task;
    return task;
  }
  private async startLibrary(name: string) {
    if (
      this.server &&
      this.nameOfLibrary === name &&
      this.openedDatabase === database.getDatabase(name)
    )
      return;
    await this.server?.close();
    this.server = undefined;
    const db = database.getDatabase(name);
    if (!db?.open) return;
    let state = readDeviceSyncState(db);
    if (!state) {
      const library = ContentIdentityTable.library(db)?.sourceId;
      const witness =
        library &&
        join(
          this.directory(),
          createHash("sha256").update(library).digest("hex"),
          "canonical-head.json"
        );
      if (witness && existsSync(witness)) {
        const saved = parseDeviceState(
          JSON.stringify(JSON.parse(readFileSync(witness, "utf8")).state)
        );
        if (
          saved.library === library &&
          saved.node === this.nodeId() &&
          saved.authority === saved.node
        ) {
          const head = randomUUID();
          state = {
            ...saved,
            head,
            ackHead: head,
            ackSeq: 0,
            revision: saved.revision + 1,
            requiresSnapshot: true,
            recovering: true,
          };
          db.prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)").run(
            JSON.stringify(state)
          );
          initializeDeviceSyncDatabase(db, DEVICE_SQL);
        }
      }
    }
    if (!state?.enabled || state.authority !== state.node) return;
    if (state.node !== this.nodeId())
      throw new Error("DEVICE_SYNC_IDENTITY: 这份资料库来自另一台排序设备，请通过配对建立本机副本");
    await this.prepare(name);
    const store = new DeviceDatabaseStore(
      db,
      (document, options) => projectDeviceDocument(db, document, options),
      async plan =>
        plan.snapshot || plan.changes?.length ? PiSessionHost.acquireLibrary(name) : () => {}
    );
    const engine = new DeviceSyncEngine(store);
    const directory = join(
      this.directory(),
      createHash("sha256").update(state.library).digest("hex")
    );
    const server = new DeviceSyncServer(
      directory,
      engine,
      new DeviceAssetStore(join(PathUtil.getAppDir(), "resources")),
      async () => {
        if (database.getDatabase(name) !== db || !db.open)
          throw new Error("DEVICE_SYNC_LIBRARY: 资料库已关闭");
        await this.prepare(name);
      },
      changes => {
        collaboration.receiveDeviceDocuments(name);
        this.lastSync = Date.now();
        for (const window of BrowserWindow.getAllWindows())
          if (!window.isDestroyed() && !window.webContents.isDestroyed())
            window.webContents.send("device-sync:changed", { databaseName: name });
        const events = {
          cards: ["card:updated", "cardId"],
          articles: ["article:updated", "articleId"],
          project_item: ["project-item:updated", "projectItemId"],
        } as const;
        for (const change of changes) {
          if (!change.after) continue;
          const event = events[change.table as keyof typeof events];
          if (!event) continue;
          const key = change.key[0],
            id = Number(typeof key === "object" && key && "$integer" in key ? key.$integer : key);
          if (!Number.isSafeInteger(id)) continue;
          for (const window of BrowserWindow.getAllWindows())
            if (!window.isDestroyed() && !window.webContents.isDestroyed())
              window.webContents.send(event[0], { databaseName: name, [event[1]]: id });
        }
        database.notifyExternalWrite("device-sync:changed");
      },
      asset => {
        const rows = db
          .prepare(
            "SELECT paths FROM _tau_device_documents UNION ALL SELECT json_extract(payload,'$.paths') AS paths FROM _tau_device_note_copies UNION ALL SELECT json_extract(document.value,'$.paths') AS paths FROM _tau_device_branches,json_each(payload,'$.documents') AS document"
          )
          .all() as { paths: string }[];
        return rows.some(
          row =>
            row.paths &&
            Object.values(JSON.parse(row.paths)).includes(
              `~/.editor/resources/device-sync/${asset}`
            )
        );
      }
    );
    try {
      await server.listen();
      this.server = server;
      this.openedDatabase = db;
      this.nameOfLibrary = name;
      this.error = undefined;
    } catch (error) {
      await server.close();
      throw error;
    }
  }
  async init() {
    database.onDatabaseConnected(name => {
      if (this.setting()?.enabled && this.setting()?.database === name)
        void this.start(name).catch(error => {
          this.error = error instanceof Error ? error.message : "局域网同步启动失败";
        });
    });
    const setting = this.setting();
    if (setting?.enabled)
      await this.start(setting.database).catch(error => {
        this.error = String(error);
      });
    const timer = setInterval(() => {
      for (const [name, db] of database.databases)
        if (db.open && readDeviceSyncState(db)?.enabled && !this.bootstrapping.has(name))
          void this.prepare(name).catch(error => {
            this.error = String(error);
          });
    }, 1000);
    timer.unref();
    app.on("quit", () => {
      void this.server?.close();
    });
    ipcMain.handle("device-sync:status", event => {
      const { name, db } = this.forEvent(event);
      return {
        enabled: Boolean(this.server && name === this.nameOfLibrary),
        database: name,
        enrolled: Boolean(readDeviceSyncState(db)),
        peers: this.server?.listPeers() ?? [],
        lastSync: this.lastSync,
        error: this.error,
        branches: (
          db.prepare("SELECT count(*) AS n FROM _tau_device_branches").get() as { n: number }
        ).n,
        noteCopies: (
          db.prepare("SELECT count(*) AS n FROM _tau_device_note_copies").get() as { n: number }
        ).n,
      };
    });
    ipcMain.handle("device-sync:enable", async event => {
      const { name, db } = this.forEvent(event);
      const drain = await prepareDurableDocuments({
        databaseName: name,
        reason: "database-change",
      });
      this.bootstrapping.add(name);
      try {
        if (db.prepare("SELECT 1 FROM collaboration_bindings LIMIT 1").get())
          throw new Error(
            "DEVICE_SYNC_SHARED_CONTENT: 请先结束该资料库中的云端共享正文，再建立设备同步"
          );
        const previous = readDeviceSyncState(db);
        if (!previous) {
          const identity = ContentIdentityTable.establishBaseline(db);
          const schema = (
            db.prepare("SELECT value FROM schema_meta WHERE key='main_schema_hash'").get() as {
              value: string;
            }
          ).value;
          const node = this.nodeId(),
            head = randomUUID();
          db.prepare("INSERT INTO _tau_device_state(id,payload) VALUES (1,?)").run(
            JSON.stringify({
              library: identity.sourceId,
              schema,
              node,
              authority: node,
              epoch: randomUUID(),
              head,
              ackHead: head,
              ackSeq: 0,
              enabled: true,
              revision: 0,
            })
          );
        } else if (previous.node !== previous.authority)
          throw new Error("DEVICE_SYNC_AUTHORITY: 请连接这份资料库原来的配对电脑");
        initializeDeviceSyncDatabase(db, DEVICE_SQL);
        await collaboration.prepareDeviceLibrary(event, name);
        await collaboration.prepareDeviceDocuments(name);
        this.save(name, true);
        await this.start(name);
      } finally {
        this.bootstrapping.delete(name);
        drain.rollback();
      }
    });
    ipcMain.handle("device-sync:pairing", async event => {
      const { name } = this.forEvent(event);
      if (name !== this.nameOfLibrary || !this.server)
        throw new Error("请先开启当前资料库的设备同步");
      return this.server.pairingCode();
    });
    ipcMain.handle("device-sync:pause", async event => {
      const { name } = this.forEvent(event);
      if (name === this.nameOfLibrary) {
        this.save(name, false);
        await this.server?.close();
        this.server = undefined;
      }
    });
    ipcMain.handle("device-sync:revoke", (event, id: string) => {
      const { name } = this.forEvent(event);
      if (name !== this.nameOfLibrary) throw new Error("资料库已变化");
      this.server?.revoke(id);
    });
    ipcMain.handle("device-sync:copies", event => {
      const { db } = this.forEvent(event);
      return db
        .prepare(
          "SELECT id,reason,'library' AS kind FROM _tau_device_branches UNION ALL SELECT id,reason,'note' AS kind FROM _tau_device_note_copies"
        )
        .all();
    });
    ipcMain.handle("device-sync:export-copy", async (event, id: string, kind: string) => {
      const { db } = this.forEvent(event);
      if (kind === "note") {
        const row = db.prepare("SELECT payload FROM _tau_device_note_copies WHERE id=?").get(id) as
          | { payload: string }
          | undefined;
        if (!row) throw new Error("副本不存在");
        const directory = join(this.directory(), "copies");
        mkdirSync(directory, { recursive: true });
        const path = join(directory, `${randomUUID()}.json`);
        writeFileSync(path, row.payload, { mode: 0o600 });
        shell.showItemInFolder(path);
        return path;
      }
      if (kind !== "library") throw new Error("副本类型无效");
      const row = db.prepare("SELECT payload FROM _tau_device_branches WHERE id=?").get(id) as
        | { payload: string }
        | undefined;
      if (!row) throw new Error("副本不存在");
      const snapshot = JSON.parse(row.payload),
        documents = await Promise.all(snapshot.documents.map(prepareDeviceDocument));
      const file = join(PathUtil.getAppDir(), `sync-conflict-${randomUUID()}.db`),
        copy = new Database(file);
      try {
        copy.exec(MAIN_SQL);
        initializeDeviceSyncDatabase(copy, DEVICE_SQL);
        const state = {
          ...readDeviceSyncState(db)!,
          node: this.nodeId(),
          head: randomUUID(),
          epoch: randomUUID(),
          ackSeq: 0,
          revision: 0,
        };
        state.authority = state.node;
        state.ackHead = state.head;
        copy
          .prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)")
          .run(JSON.stringify(state));
        await new DeviceDatabaseStore(copy, document =>
          projectDeviceDocument(copy, document)
        ).commit({ expectedHead: state.head, expectedSequence: 0, state, snapshot, documents });
      } finally {
        copy.close();
      }
      shell.showItemInFolder(file);
      return file;
    });
  }
}
export default new DeviceSyncModule();
