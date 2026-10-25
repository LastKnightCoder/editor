// @vitest-environment node
import { expect, it, vi } from "vitest";
const isolation = vi.hoisted(() => {
  const root = process.env.TAU_REHEARSAL_CASE ?? "",
    source =
      process.env.TAU_REHEARSAL_SOURCE ?? `${process.env.HOME ?? process.env.USERPROFILE}/.editor`;
  const writes: string[] = [],
    databases: string[] = [],
    denied: string[] = [];
  const text = (v: unknown) => (v instanceof URL ? decodeURIComponent(v.pathname) : String(v));
  const readPath = (v: unknown) => {
    if (typeof v !== "string" && !(v instanceof URL)) return v;
    const p = text(v);
    return p.startsWith(source + "/") ? root + p.slice(source.length) : v;
  };
  const writePath = (v: unknown) => {
    const p = decodeURIComponent(new URL("file://" + text(v)).pathname);
    if (!root || !(p === root || p.startsWith(root + "/"))) {
      denied.push(p);
      throw new Error("REHEARSAL_WRITE_DENIED");
    }
    writes.push(p);
    return v;
  };
  return { root, source, writes, databases, denied, readPath, writePath };
});
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>(),
    result: Record<string, unknown> = { ...fs };
  for (const key of [
    "readFileSync",
    "statSync",
    "lstatSync",
    "existsSync",
    "readdirSync",
    "realpathSync",
  ] as const)
    result[key] = (...a: any[]) => (fs[key] as any)(isolation.readPath(a[0]), ...a.slice(1));
  for (const key of [
    "writeFileSync",
    "appendFileSync",
    "mkdirSync",
    "mkdtempSync",
    "rmSync",
    "unlinkSync",
    "chmodSync",
  ] as const)
    result[key] = (...a: any[]) => (fs[key] as any)(isolation.writePath(a[0]), ...a.slice(1));
  result.copyFileSync = (s: any, t: any, ...a: any[]) =>
    fs.copyFileSync(isolation.readPath(s) as string, isolation.writePath(t) as string, ...a);
  result.renameSync = (s: any, t: any) =>
    fs.renameSync(isolation.writePath(s) as string, isolation.writePath(t) as string);
  result.openSync = (p: any, f: any, ...a: any[]) =>
    (fs.openSync as any)(
      f === "r" || f === 0 ? isolation.readPath(p) : isolation.writePath(p),
      f,
      ...a
    );
  return result;
});
vi.mock("node:fs/promises", async original => {
  const fs = await original<typeof import("node:fs/promises")>(),
    result: Record<string, unknown> = { ...fs };
  for (const key of ["readFile", "stat", "lstat", "readdir", "realpath", "access"] as const)
    result[key] = (...a: any[]) => (fs[key] as any)(isolation.readPath(a[0]), ...a.slice(1));
  for (const key of [
    "writeFile",
    "appendFile",
    "mkdir",
    "mkdtemp",
    "rm",
    "unlink",
    "chmod",
  ] as const)
    result[key] = (...a: any[]) => (fs[key] as any)(isolation.writePath(a[0]), ...a.slice(1));
  result.copyFile = (s: any, t: any, ...a: any[]) =>
    fs.copyFile(isolation.readPath(s) as string, isolation.writePath(t) as string, ...a);
  result.rename = (s: any, t: any) =>
    fs.rename(isolation.writePath(s) as string, isolation.writePath(t) as string);
  return result;
});
vi.mock("node:os", async original => ({
  ...(await original<typeof import("node:os")>()),
  tmpdir: () => isolation.root + "/tmp",
}));
vi.mock("better-sqlite3", async original => {
  const { default: Database } = await original<{ default: typeof import("better-sqlite3") }>();
  return {
    default: new Proxy(Database, {
      construct(target, args) {
        if (typeof args[0] === "string" && args[0] !== ":memory:") {
          isolation.writePath(args[0]);
          isolation.databases.push(args[0]);
        }
        return Reflect.construct(target, args);
      },
    }),
  };
});
vi.mock("electron", () => ({
  app: {
    getPath: () => isolation.root,
    getVersion: () => "0.60.0",
    on: vi.fn(),
    once: vi.fn(),
    isReady: () => true,
    isPackaged: false,
  },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn() },
  dialog: {},
  safeStorage: { isEncryptionAvailable: () => false },
}));
vi.mock("../src-electron/main/utils/PathUtil", () => ({
  default: { getAppDir: () => isolation.root },
}));
vi.mock("../src-electron/main/modules/collaboration/session-identity", async original => {
  const functions =
    await original<typeof import("../src-electron/main/modules/collaboration/session-identity")>();
  return {
    ...functions,
    localSessionId: (name: string, id: number, time: number) =>
      functions.localSessionId(isolation.source + "/" + name.split("/").at(-1), id, time),
  };
});
vi.mock("../src-electron/main/modules/video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../src-electron/main/services/content-execution", () => ({
  contentExecutor: {
    execute: async () => {
      const { readFileSync } = await import("node:fs");
      return JSON.parse(readFileSync(process.env.TAU_REHEARSAL_CONTRACTS!, "utf8"));
    },
  },
}));
vi.mock("../src-electron/main/windows/notification-router", () => ({
  routeNotification: vi.fn(),
  dismissNotification: vi.fn(),
}));

it.skipIf(!process.env.TAU_REHEARSAL_CASE)(
  "真实资料库副本：升级、中断恢复和保真审计",
  async () => {
    const fs = await import("node:fs"),
      { join, basename } = await import("node:path");
    const { default: database } = await import("../src-electron/main/modules/database");
    const { default: manager } = await import("../src-electron/main/modules/collaboration");
    const { default: boards } = await import("../src-electron/main/modules/whiteboard-documents");
    const { LegacyContentUpgradeModule } =
      await import("../src-electron/main/modules/legacy-content-upgrade");
    const { CollaborationLocalStore } =
      await import("../src-electron/main/modules/collaboration/local-store");
    const { ContentLocalState } =
      await import("../src-electron/main/modules/collaboration/content-local-state");
    const { CollaborationAssetService } =
      await import("../src-electron/main/modules/collaboration/asset-service");
    const { ContentMigration } =
      await import("../src-electron/main/modules/collaboration/content-migration");
    const { WhiteboardMigration } =
      await import("../src-electron/main/modules/whiteboard-documents/migration");
    const { WhiteboardTransitions } =
      await import("../src-electron/main/modules/whiteboard-documents/transitions");
    const { WhiteboardJournal } =
      await import("../src-electron/main/modules/whiteboard-documents/journal");
    const { ContentDocumentTable } =
      await import("../src-electron/main/modules/tables/content-document");
    const { default: DataTable } = await import("../src-electron/main/modules/tables/data-table");
    const { default: PageTable } =
      await import("../src-electron/main/modules/tables/white-board-content");
    const { WhiteboardModel } = await import("@tau/collaboration"),
      Y = await import("yjs");
    const root = isolation.root;
    expect(fs.existsSync(join(root, "rehearsal-marker.json"))).toBe(true);
    const network: string[] = [];
    vi.stubGlobal("fetch", async () => {
      network.push("fetch");
      throw new Error("REHEARSAL_NETWORK_DISABLED");
    });
    const client = {
      identities: new Map(),
      canonicalUrl: (url: string) => url,
      identity: async () => {
        network.push("identity");
        throw new Error("REHEARSAL_NETWORK_DISABLED");
      },
      request: async () => {
        network.push("request");
        throw new Error("REHEARSAL_NETWORK_DISABLED");
      },
    };
    const report: any = {
      case: basename(root),
      startedAt: new Date().toISOString(),
      openFailures: [],
      databases: {},
      network,
      writesDenied: isolation.denied,
    };
    const checkpoint = (kind: string, phase: string, operationId: string) => {
      if (process.env.TAU_REHEARSAL_CRASH !== `${kind}:${phase}`) return;
      const file = join(root, `crash-${kind}-${phase}.json`);
      if (fs.existsSync(file)) return;
      fs.writeFileSync(
        file,
        JSON.stringify({
          kind,
          phase,
          operationId,
          pid: process.pid,
          time: new Date().toISOString(),
        })
      );
      const fd = fs.openSync(file, "r");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      console.log(`REHEARSAL_KILL ${kind}:${phase}`);
      process.kill(process.pid, "SIGKILL");
    };
    const installContent = ContentMigration.prototype.install;
    ContentMigration.prototype.install = function (db, id, hook) {
      return installContent.call(this, db, id, phase => {
        hook?.(phase);
        checkpoint("content", phase, id);
      });
    };
    const installBoard = WhiteboardMigration.prototype.install;
    WhiteboardMigration.prototype.install = function (db, name, id, hook) {
      return installBoard.call(this, db, name, id, phase => {
        hook?.(phase);
        checkpoint("board", phase, id);
      });
    };
    const settings = JSON.parse(fs.readFileSync(join(root, "setting.json"), "utf8"));
    const store = new CollaborationLocalStore(join(root, "collaboration")),
      state = new ContentLocalState(store.db);
    for (const row of store.db.prepare("SELECT id,manifest_path FROM recoveries").all() as any[])
      store.db
        .prepare("UPDATE recoveries SET manifest_path=? WHERE id=?")
        .run(String(row.manifest_path).replace(isolation.source, root), row.id);
    const assets = new CollaborationAssetService(store, root, client.identity, client.canonicalUrl);
    Object.assign(manager, {
      store,
      contentState: state,
      directory: join(root, "collaboration"),
      client,
      assets,
      stopped: false,
      attach: () => {},
    });
    for (const { name } of settings.database.databases) {
      try {
        database.databases.set(name, database.openDatabase(name, "normal"));
      } catch (error) {
        report.openFailures.push({ name, error: String(error) });
      }
    }
    (database as any).currentDatabaseName = settings.database.active;
    const pendingDocuments = new Set(
      state.pendingMigrations().map(record => record.plan.documentId)
    );
    for (const info of store.list()) {
      if (
        info.mode === "local" &&
        info.source?.contentDocumentId &&
        !pendingDocuments.has(info.id) &&
        !state.preparation(info.id)
      )
        continue;
      try {
        const { doc } = store.load(info.id);
        (manager as any).restore(info, doc);
      } catch (error) {
        report.openFailures.push({ cache: info.id, error: String(error) });
      }
    }
    const journal = new WhiteboardJournal(join(root, "whiteboard-documents/journal.db"));
    const counts = (db: any, kind: any, id: number, delta: number) => {
      if (kind === "data-table") {
        if (delta > 0) DataTable.incrementRefCount(db, id);
        else DataTable.remove(db, id);
      } else if (delta > 0) PageTable.incrementRefCount(db, id);
      else PageTable.deleteWhiteboard(db, id);
    };
    const migration = new WhiteboardMigration(
      state,
      journal,
      counts,
      (db, name) => db.open && database.getDatabase(name) === db
    );
    Object.assign(boards, {
      store,
      journal,
      migration,
      transitions: new WhiteboardTransitions(migration, store, client as any, assets),
    });
    const upgrade = new LegacyContentUpgradeModule();
    const progress = setInterval(() => {
      const db = database.getDatabase(settings.database.active);
      if (db?.open)
        console.log(
          "REHEARSAL_PROGRESS",
          JSON.stringify({
            case: basename(root),
            contents: db.prepare("SELECT count(*) total FROM content_documents").get(),
            boards: db.prepare("SELECT count(*) total FROM whiteboard_documents").get(),
            pending: state.pendingMigrations().length,
          })
        );
    }, 15_000);
    try {
      if (process.env.TAU_REHEARSAL_ONLY === "boards") {
        report.boardFailures = [];
        const contracts = JSON.parse(fs.readFileSync(process.env.TAU_REHEARSAL_CONTRACTS!, "utf8"));
        for (const [name, db] of database.databases)
          for (const { id } of db
            .prepare("SELECT id FROM white_board_contents ORDER BY id")
            .all() as { id: number }[])
            try {
              await boards.upgradeLegacyWhiteboard(name, id, contracts);
            } catch (error) {
              report.boardFailures.push({ database: name, id, error: String(error) });
            }
      } else if (process.env.TAU_REHEARSAL_ONLY === "contents") {
        const ids = JSON.parse(process.env.TAU_REHEARSAL_CONTENT_IDS ?? "[]") as number[];
        expect(ids.length).toBeGreaterThan(0);
        const contracts = JSON.parse(fs.readFileSync(process.env.TAU_REHEARSAL_CONTRACTS!, "utf8"));
        for (const name of database.databases.keys())
          for (const id of ids) await manager.upgradeLegacyContent(name, id, contracts);
      } else {
        await upgrade.init();
        await (upgrade as any).queue.idle();
        await (upgrade as any).queue.pause();
      }
      for (const timer of (upgrade as any).retries.values()) clearTimeout(timer);
      for (const [name, db] of database.databases) {
        if (!db.open) continue;
        const snapshot: any = {
          counts: {},
          rows: {},
          bodies: [],
          boards: [],
          integrity: db.pragma("integrity_check", { simple: true }),
        };
        for (const table of [
          "contents",
          "cards",
          "articles",
          "white_boards",
          "white_board_contents",
          "content_documents",
          "whiteboard_documents",
          "content_entity_relations",
          "whiteboard_entity_relations",
        ])
          snapshot.counts[table] = (
            db.prepare(`SELECT count(*) total FROM ${table}`).get() as any
          ).total;
        for (const table of ["cards", "articles", "white_boards", "white_board_contents"])
          snapshot.rows[table] = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
        for (const row of db
          .prepare("SELECT id,create_time,update_time,content,ref_count FROM contents ORDER BY id")
          .all() as any[]) {
          const document = ContentDocumentTable.read(db, row.id);
          snapshot.bodies.push({
            ...row,
            content: JSON.parse(row.content),
            contracts: document?.contracts,
            revision: document?.revision,
          });
        }
        for (const row of db
          .prepare("SELECT document_id,state FROM whiteboard_documents")
          .all() as any[]) {
          const doc = new Y.Doc();
          Y.applyUpdate(doc, row.state);
          const model = new WhiteboardModel(doc);
          snapshot.boards.push({
            id: row.document_id,
            value: model.read(),
            pages: db
              .prepare("SELECT * FROM whiteboard_document_pages WHERE document_id=?")
              .all(row.document_id),
          });
          model.dispose();
          doc.destroy();
        }
        snapshot.identities = db.prepare("SELECT * FROM entity_identities").all();
        snapshot.upgrade = store.get(`legacy-content-upgrade:${name}`, null);
        fs.writeFileSync(join(root, `${name}.audit.json`), JSON.stringify(snapshot));
        report.databases[name] = {
          counts: snapshot.counts,
          integrity: snapshot.integrity,
          upgrade: snapshot.upgrade,
        };
      }
      report.recoveries = (
        state.db.prepare("SELECT count(*) total FROM recoveries").get() as any
      ).total;
      report.pending = state.pendingMigrations().map(record => ({
        id: record.plan.operationId,
        kind: record.plan.kind ?? "content",
        phase: record.phase,
        workspace: record.plan.workspaceId,
      }));
      report.resourceRows = store.db.prepare("SELECT * FROM resources").all();
      report.sqliteFiles = [...new Set(isolation.databases)];
      report.writeCount = isolation.writes.length;
      report.finishedAt = new Date().toISOString();
      fs.writeFileSync(join(root, "rehearsal-report.json"), JSON.stringify(report, null, 2));
      console.log(
        "REHEARSAL_FINISHED",
        JSON.stringify({
          case: report.case,
          databases: Object.keys(report.databases),
          pending: report.pending.length,
          recoveries: report.recoveries,
          denied: report.writesDenied.length,
        })
      );
      expect(isolation.denied).toEqual([]);
      expect(network).toEqual([]);
    } finally {
      clearInterval(progress);
      for (const db of database.databases.values()) if (db.open) db.close();
      journal.close();
      store.db.close();
    }
  },
  90 * 60_000
);
