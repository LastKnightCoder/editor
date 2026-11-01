import {
  app,
  BrowserWindow,
  ipcMain,
  powerMonitor,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import Database from "better-sqlite3";
import MAIN_SQL from "@tau/db-schema/schema/main.sql?raw";
import DEVICE_SQL from "@tau/db-schema/schema/device-sync.sql?raw";
import { prepareDeviceDocument } from "@tau/collaboration/src/device-sync/documents";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import type {
  DeviceCommit,
  DeviceReply,
  RowChange,
} from "@tau/collaboration/src/device-sync/protocol";
import { DeviceSyncEngine } from "@tau/collaboration/src/device-sync/engine";
import database from "../database";
import collaboration from "../collaboration";
import PathUtil from "../../utils/PathUtil";
import { ContentIdentityTable } from "../tables/content-identity";
import { prepareDurableDocuments, type DocumentDrain } from "../durable-document-lifecycle";
import {
  DeviceDatabaseStore,
  readDeviceSyncState,
  initializeDeviceSyncDatabase,
  resetDeviceSyncDatabase,
} from "./database-store";
import { projectDeviceDocument } from "./content-state";
import { DeviceAssetStore } from "./asset-store";
import { DeviceSyncServer } from "./server";
import PiSessionHost from "../pi-session-host";
import { parseDeviceState } from "./recovery";
import { DeviceSyncClient } from "./client";
import {
  pairDesktopReplica,
  prepareReplicaDownload,
  readDesktopPeer,
  type DesktopDevicePeer,
} from "./replica";
import { writeDeviceState } from "./atomic-file";
import whiteboards from "../whiteboard-documents";
import mainContentIndexDBManager from "../main-content-index-db";
import { installDatabaseDownload } from "../database-download";

export class DeviceSyncModule {
  name = "device-sync";
  private server?: DeviceSyncServer;
  private openedDatabase?: Database.Database;
  private nameOfLibrary?: string;
  private lastSync?: number;
  private error?: string;
  private starting: Promise<void> = Promise.resolve();
  private preparing = new Map<Database.Database, Promise<void>>();
  private enabling = new Map<Database.Database, Promise<void>>();
  private stopping = new Map<Database.Database, Promise<void>>();
  private preparationProgress = new Map<Database.Database, { completed: number; total: number }>();
  private bootstrapping = new Set<string>();
  private client?: DeviceSyncClient;
  private clientDatabase?: Database.Database;
  private replacing = new Set<string>();
  private pairing = false;
  private async guardCommit(name: string, plan: DeviceCommit, assertActive = () => {}) {
    assertActive();
    const release =
      plan.snapshot || plan.changes?.length ? await PiSessionHost.acquireLibrary(name) : () => {};
    let drain: DocumentDrain | undefined;
    try {
      assertActive();
      if (
        plan.snapshot ||
        [...(plan.changes ?? []), ...(plan.rollback ?? [])].some(change =>
          [
            "white_boards",
            "white_board_contents",
            "whiteboard_documents",
            "whiteboard_document_pages",
            "whiteboard_entity_relations",
          ].includes(change.table)
        )
      )
        drain = await whiteboards.prepareDeviceSync(name);
      assertActive();
      return (committed: boolean) => {
        try {
          if (committed) drain?.commit();
          else drain?.rollback();
        } finally {
          release();
        }
      };
    } catch (error) {
      try {
        drain?.rollback();
      } finally {
        release();
      }
      throw error;
    }
  }
  private peer() {
    try {
      return readDesktopPeer(this.directory());
    } catch (error) {
      this.error = String(error);
      return undefined;
    }
  }
  private startReplica(name: string) {
    if (this.replacing.has(name)) return;
    const peer = this.peer(),
      db = database.getDatabase(name);
    if (!peer?.enabled || peer.database !== name || !db?.open) return;
    if (
      this.clientDatabase === db &&
      this.client?.peer.database === name &&
      this.client.peer.token === peer.token
    )
      return;
    this.client?.stop();
    this.client = undefined;
    this.clientDatabase = undefined;
    const state = readDeviceSyncState(db);
    if (
      !state ||
      state.node !== this.nodeId() ||
      state.library !== peer.library ||
      state.authority === state.node
    ) {
      this.error = "DEVICE_SYNC_IDENTITY: 本机副本与配对身份不同，请重新配对";
      return;
    }
    const assertActive = () => {
      if (this.client !== client || database.getDatabase(name) !== db || !db.open)
        throw new Error("DEVICE_SYNC_CLOSED: 当前设备连接已变化");
    };
    const assets = new DeviceAssetStore(join(PathUtil.getAppDir(), "resources"));
    const engine = new DeviceSyncEngine(
      new DeviceDatabaseStore(
        db,
        (document, settings) => projectDeviceDocument(db, document, settings),
        plan => this.guardCommit(name, plan, client.assertActive)
      )
    );
    const client: DeviceSyncClient = new DeviceSyncClient(peer, {
      engine,
      assets,
      assertActive,
      prepare: () => this.prepare(name),
      assetNames: () => [
        ...new Set(
          (db.prepare("SELECT paths FROM _tau_device_documents").all() as { paths: string }[])
            .flatMap(row => Object.values(JSON.parse(row.paths) as Record<string, string>))
            .map(path => path.split("/").at(-1)!)
            .filter(name => /^[a-f0-9]{64}\.(png|jpg|webp|gif|bin)$/.test(name))
        ),
      ],
      changed: reply => {
        if (reply.snapshot || reply.changes.length || reply.documents.length)
          this.changed(name, reply.changes);
      },
      replace: reply => this.replaceReplica(peer, reply),
    });
    this.client = client;
    this.clientDatabase = db;
    this.error = undefined;
    client.start();
  }
  private changed(name: string, changes: RowChange[]) {
    this.error = undefined;
    collaboration.receiveDeviceDocuments(name);
    this.lastSync = Date.now();
    const events = {
      cards: ["card:updated", "cardId"],
      articles: ["article:updated", "articleId"],
      project_item: ["project-item:updated", "projectItemId"],
    } as const;
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send("device-sync:changed", { databaseName: name });
      for (const change of changes) {
        const event = events[change.table as keyof typeof events];
        if (!change.after || !event) continue;
        const key = change.key[0],
          id = Number(typeof key === "object" && key && "$integer" in key ? key.$integer : key);
        if (Number.isSafeInteger(id))
          window.webContents.send(event[0], { databaseName: name, [event[1]]: id });
      }
    }
    database.notifyExternalWrite("device-sync:changed", name);
  }
  private async replaceReplica(peer: DesktopDevicePeer, reply: DeviceReply) {
    const name = peer.database,
      path = join(PathUtil.getAppDir(), name);
    const temporary = `${path}.${randomUUID()}.download`;
    const windows = BrowserWindow.getAllWindows().filter(
      window => database.windowToDatabase.get(window.id) === name
    );
    const release = await PiSessionHost.acquireLibrary(name);
    this.replacing.add(name);
    this.bootstrapping.add(name);
    let closed = false;
    try {
      if (this.client?.peer !== peer) throw new Error("DEVICE_SYNC_CLOSED: 原设备连接已停止");
      this.client.assertActive();
      await database.closeForSync(name, async () => {
        closed = true;
        this.client?.stop();
        this.client = undefined;
        const original = new Database(path, { readonly: true });
        try {
          const state = readDeviceSyncState(original);
          if (!state || state.library !== peer.library || state.node !== peer.node)
            throw new Error("DEVICE_SYNC_IDENTITY: 覆盖目标不同");
          const sequence =
            (
              original
                .prepare("SELECT seq FROM sqlite_sequence WHERE name='_tau_device_log'")
                .get() as { seq: number } | undefined
            )?.seq ?? 0;
          await prepareReplicaDownload(temporary, state, sequence, reply);
        } finally {
          original.close();
        }
        await collaboration.releaseLibrary(name);
        whiteboards.releaseLibrary(name);
        const backup = join(PathUtil.getAppDir(), "backup");
        mkdirSync(backup, { recursive: true });
        copyFileSync(path, join(backup, `device-${Date.now()}-${name}`));
        installDatabaseDownload(path, temporary, "");
        mainContentIndexDBManager.resetDatabase(name);
      });
    } finally {
      try {
        for (const file of [temporary, `${temporary}-wal`, `${temporary}-shm`])
          rmSync(file, { force: true });
        if (closed) {
          await database.reconnectForSync(name, "sync_download_reconnect");
          for (const window of windows)
            if (!window.isDestroyed()) {
              window.webContents.reload();
            }
        }
      } finally {
        release();
        this.bootstrapping.delete(name);
        this.replacing.delete(name);
        this.startReplica(name);
      }
    }
  }
  private prepare(name: string) {
    const db = database.getDatabase(name);
    if (!db?.open) return Promise.reject(new Error("DEVICE_SYNC_CLOSED: 资料库已关闭"));
    const pending = this.preparing.get(db);
    if (pending) return pending;
    const task = collaboration
      .prepareDeviceDocuments(name, (completed, total) => {
        this.preparationProgress.set(db, { completed, total });
      })
      .finally(() => {
        this.preparing.delete(db);
        this.preparationProgress.delete(db);
      });
    this.preparing.set(db, task);
    return task;
  }
  private async enableCoordinator(name: string, db: Database.Database) {
    const started = Date.now();
    this.error = undefined;
    console.info(`[device-sync] 协调开启开始: db=${name}`);
    let drain: DocumentDrain | undefined;
    this.bootstrapping.add(name);
    try {
      drain = await prepareDurableDocuments({
        databaseName: name,
        reason: "database-change",
      });
      if (!db.open || database.getDatabase(name) !== db)
        throw new Error("DEVICE_SYNC_CLOSED: 开启期间资料库已变化");
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
      await this.start(name);
      if (
        !db.open ||
        database.getDatabase(name) !== db ||
        !this.server ||
        this.openedDatabase !== db ||
        this.nameOfLibrary !== name
      )
        throw new Error("DEVICE_SYNC_CLOSED: 开启期间资料库已变化");
      this.save(name, true);
      this.error = undefined;
      console.info(`[device-sync] 协调开启完成: db=${name}, elapsedMs=${Date.now() - started}`);
    } catch (error) {
      this.error = String(error);
      console.warn(
        `[device-sync] 协调开启失败: db=${name}, elapsedMs=${Date.now() - started}`,
        error
      );
      throw error;
    } finally {
      this.bootstrapping.delete(name);
      drain?.rollback();
    }
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
  private async stopCoordinator(name: string, db: Database.Database) {
    await Promise.allSettled([this.enabling.get(db)]);
    await Promise.allSettled([this.starting]);
    if (!db.open || database.getDatabase(name) !== db)
      throw new Error("DEVICE_SYNC_CLOSED: 停止期间资料库已变化");
    const state = readDeviceSyncState(db);
    if (!state || state.node !== state.authority || state.node !== this.nodeId())
      throw new Error("DEVICE_SYNC_AUTHORITY: 当前资料库不是由本机协调");
    const path = join(PathUtil.getAppDir(), name),
      temporary = `${path}.${randomUUID()}.reset`,
      backup = join(PathUtil.getAppDir(), "backup", `device-sync-exit-${randomUUID()}`),
      session = join(this.directory(), createHash("sha256").update(state.library).digest("hex")),
      savedSession = join(backup, "session"),
      settingsPath = join(this.directory(), "host.json"),
      settings = this.setting()?.database === name ? readFileSync(settingsPath, "utf8") : undefined;
    const windows = BrowserWindow.getAllWindows().filter(
      window => database.windowToDatabase.get(window.id) === name
    );
    const release = await PiSessionHost.acquireLibrary(name);
    this.bootstrapping.add(name);
    this.replacing.add(name);
    let closed = false,
      installed = false,
      moved = false;
    try {
      if (this.nameOfLibrary === name) {
        const server = this.server;
        this.server = undefined;
        this.openedDatabase = undefined;
        this.nameOfLibrary = undefined;
        await server?.close();
      }
      await Promise.allSettled([this.preparing.get(db)]);
      await collaboration.resolveDeviceJsonIntents(name);
      await database.closeForSync(name, async () => {
        closed = true;
        mkdirSync(backup, { recursive: true, mode: 0o700 });
        copyFileSync(path, join(backup, name));
        copyFileSync(path, temporary);
        const candidate = new Database(temporary);
        try {
          resetDeviceSyncDatabase(candidate);
          candidate.pragma("wal_checkpoint(TRUNCATE)");
        } finally {
          candidate.close();
        }
        await collaboration.releaseLibrary(name);
        whiteboards.releaseLibrary(name);
        if (existsSync(session)) {
          renameSync(session, savedSession);
          moved = true;
        }
        if (settings !== undefined) rmSync(settingsPath, { force: true });
        installDatabaseDownload(path, temporary, "");
        installed = true;
      });
      this.lastSync = undefined;
      this.error = undefined;
    } catch (error) {
      if (!installed) {
        if (moved) renameSync(savedSession, session);
        if (settings !== undefined) writeFileSync(settingsPath, settings, { mode: 0o600 });
      }
      throw error;
    } finally {
      try {
        for (const file of [temporary, `${temporary}-wal`, `${temporary}-shm`])
          rmSync(file, { force: true });
        if (closed) {
          await database.reconnectForSync(name, "sync_download_reconnect");
          for (const window of windows) if (!window.isDestroyed()) window.webContents.reload();
        }
      } finally {
        release();
        this.bootstrapping.delete(name);
        this.replacing.delete(name);
      }
    }
  }
  private forEvent(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("窗口已关闭");
    const name = database.windowToDatabase.get(window.id);
    if (!name) throw new Error("资料库尚未就绪，请等待窗口重新连接");
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
      plan => this.guardCommit(name, plan)
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
      changes => this.changed(name, changes),
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
      this.startReplica(name);
      if (this.setting()?.enabled && this.setting()?.database === name)
        void this.start(name).catch(error => {
          this.error = error instanceof Error ? error.message : "局域网同步启动失败";
        });
    });
    const savedPeer = this.peer();
    if (savedPeer) this.startReplica(savedPeer.database);
    const wake = () => this.client?.wake();
    powerMonitor.on("resume", wake);
    app.on("browser-window-focus", wake);
    const setting = this.setting();
    if (setting?.enabled)
      void this.start(setting.database).catch(error => {
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
      this.client?.stop();
      void this.server?.close();
    });
    ipcMain.handle("device-sync:status", event => {
      const { name, db } = this.forEvent(event);
      const state = readDeviceSyncState(db);
      const replica = state && state.node !== state.authority;
      const coordinator = state && (this.setting()?.database === name || this.enabling.has(db));
      const peer = this.peer();
      const client = this.client?.peer.database === name ? this.client : undefined;
      return {
        role: replica ? "replica" : coordinator ? "coordinator" : "unpaired",
        phase: client?.status.phase,
        pendingAssets: client?.status.pendingAssets ?? 0,
        preparation: this.preparationProgress.get(db),
        enabled: replica
          ? Boolean(peer?.database === name && peer.enabled && client)
          : Boolean(this.server && name === this.nameOfLibrary),
        database: name,
        enrolled: Boolean(readDeviceSyncState(db)),
        peers: name === this.nameOfLibrary ? (this.server?.listPeers() ?? []) : [],
        lastSync: client?.status.lastSync ?? this.lastSync,
        error: client?.status.error ?? this.error,
        branches: (
          db.prepare("SELECT count(*) AS n FROM _tau_device_branches").get() as { n: number }
        ).n,
        noteCopies: (
          db.prepare("SELECT count(*) AS n FROM _tau_device_note_copies").get() as { n: number }
        ).n,
      };
    });
    ipcMain.handle("device-sync:enable", event => {
      const { name, db } = this.forEvent(event);
      if (this.stopping.has(db)) throw new Error("DEVICE_SYNC_BUSY: 正在停止本机协调，请稍后重试");
      const state = readDeviceSyncState(db);
      if (state && state.node !== state.authority) {
        const peer = this.peer();
        if (!peer || peer.database !== name) throw new Error("请重新配对协调电脑");
        writeDeviceState(join(this.directory(), "peer.json"), { ...peer, enabled: true });
        this.startReplica(name);
        return;
      }
      const pending = this.enabling.get(db);
      if (pending) return pending;
      const task = this.enableCoordinator(name, db).finally(() => this.enabling.delete(db));
      this.enabling.set(db, task);
      return task;
    });
    ipcMain.handle("device-sync:pair", async (event, code: string) => {
      if (this.pairing) throw new Error("DEVICE_SYNC_BUSY: 配对仍在进行");
      const { name } = this.forEvent(event);
      this.pairing = true;
      this.client?.stop();
      this.client = undefined;
      try {
        const result = await pairDesktopReplica({
          directory: this.directory(),
          databases: PathUtil.getAppDir(),
          node: this.nodeId(),
          code,
          name: hostname(),
          existingDatabase: name,
        });
        this.startReplica(result.peer.database);
        return { database: result.peer.database, existing: result.existing };
      } finally {
        this.pairing = false;
        const peer = this.peer();
        if (peer) this.startReplica(peer.database);
      }
    });
    ipcMain.handle("device-sync:sync", async event => {
      const { name } = this.forEvent(event);
      if (!this.client || this.client.peer.database !== name)
        throw new Error("请先连接当前库的协调电脑");
      await this.client.synchronize();
    });
    ipcMain.handle("device-sync:download", async event => {
      const { name } = this.forEvent(event);
      if (!this.client || this.client.peer.database !== name)
        throw new Error("请先连接当前库的协调电脑");
      try {
        await this.client.download();
      } catch (error) {
        this.error = String(error);
        throw error;
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
      const peer = this.peer();
      if (peer?.database === name) {
        writeDeviceState(join(this.directory(), "peer.json"), { ...peer, enabled: false });
        this.client?.stop();
        this.client = undefined;
      }
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
    ipcMain.handle("device-sync:stop", event => {
      const { name, db } = this.forEvent(event);
      const pending = this.stopping.get(db);
      if (pending) return pending;
      const task = this.stopCoordinator(name, db).finally(() => this.stopping.delete(db));
      this.stopping.set(db, task);
      return task;
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
