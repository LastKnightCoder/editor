import { expect, it, vi } from "vitest";
import { mkdtempSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
const paths = vi.hoisted(() => ({ root: "" }));
vi.mock("../../utils/PathUtil", () => ({
  default: { getAppDir: () => paths.root, getHomeDir: () => paths.root },
}));
vi.mock("electron", () => ({
  app: {
    getPath: () => paths.root,
    getVersion: () => "test",
    getAppPath: () => paths.root,
    isPackaged: false,
    on: vi.fn(),
    whenReady: async () => {},
  },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  protocol: {},
  shell: {},
  nativeTheme: {},
  session: {},
}));
const schemaOf = (db: Database.Database) =>
  (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_meta' ORDER BY name"
      )
      .all() as Array<{ name: string }>
  ).map(({ name }) => ({
    name,
    columns: (db.prepare(`PRAGMA table_info("${name}")`).all() as Array<Record<string, unknown>>)
      .map(({ cid: _cid, ...column }) => column)
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    indexes: (db.prepare(`PRAGMA index_list("${name}")`).all() as Array<Record<string, unknown>>)
      .map(({ seq: _seq, ...index }) => index)
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
  }));

it.skipIf(!process.env.PI_UPGRADE_BACKUP)(
  "真实备份副本完整升级、重跑并与新库比对",
  async () => {
    paths.root = mkdtempSync(join(tmpdir(), "pi-upgrade-"));
    copyFileSync(process.env.PI_UPGRADE_BACKUP!, join(paths.root, "data.db"));
    const { default: database } = await import("../database");
    const { default: indexManager } = await import("../main-content-index-db");
    const { loadSessionTranscript } = await import("../pi-session-host-core");
    const legacy = database.openDatabase("data", "maintenance");
    database.databases.set("data", legacy);
    const migrate = (
      database as unknown as {
        migrateChatSessions(db: Database.Database, name: string, path: string): Promise<void>;
      }
    ).migrateChatSessions.bind(database);
    let fresh: Database.Database | undefined;
    try {
      await migrate(legacy, "data", join(paths.root, "data.db"));
      await database.ensureIndexDatabaseReady("data");
      await database.ensureIndexDatabaseReady("data");
      const before = legacy.prepare("SELECT id,session_file FROM chat_session ORDER BY id").all();
      await migrate(legacy, "data", join(paths.root, "data.db"));
      expect(legacy.prepare("SELECT id,session_file FROM chat_session ORDER BY id").all()).toEqual(
        before
      );
      const mark = legacy
        .prepare("SELECT value FROM migration_meta WHERE key='chat-session-pi-jsonl:v1'")
        .get() as { value: string };
      expect(JSON.parse(mark.value).failed).toBe(0);
      for (const row of before as Array<{ session_file: string }>) {
        const file = join(paths.root, "sessions", "data", row.session_file);
        expect(existsSync(file)).toBe(true);
        expect(() => loadSessionTranscript(file)).not.toThrow();
      }
      fresh = database.openDatabase("fresh", "maintenance");
      database.databases.set("fresh", fresh);
      await migrate(fresh, "fresh", join(paths.root, "fresh.db"));
      await database.ensureIndexDatabaseReady("fresh");
      expect(schemaOf(legacy)).toEqual(schemaOf(fresh));
      console.log(`升级对账通过：${before.length} 个会话，失败行 0，结构与新库一致`);
    } finally {
      indexManager.closeDatabase("data");
      indexManager.closeDatabase("fresh");
      legacy.close();
      fresh?.close();
      database.databases.clear();
      rmSync(paths.root, { recursive: true, force: true });
    }
  },
  120_000
);
