import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
const paths = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (...args: any[]) => any>(),
}));
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
  BrowserWindow: {
    getAllWindows: () => [],
    getFocusedWindow: () => null,
    fromWebContents: () => ({ id: 1 }),
  },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => any) => paths.handlers.set(name, handler),
    on: vi.fn(),
  },
  protocol: {},
  shell: {},
  nativeTheme: {},
  session: {},
}));
it("真实数据库 IPC 按会话库执行，checkpoint 被占用时拒绝关闭", async () => {
  paths.root = mkdtempSync(join(tmpdir(), "pi-database-binding-"));
  const { default: database } = await import("../database");
  const a = new Database(join(paths.root, "a.db"), { timeout: 1 });
  const b = new Database(join(paths.root, "b.db"));
  for (const db of [a, b])
    db.exec(
      "CREATE TABLE contents(id INTEGER PRIMARY KEY,create_time INTEGER,update_time INTEGER,content TEXT,count INTEGER,ref_count INTEGER); CREATE TABLE operation(operation_content_type TEXT,operation_action TEXT,operation_id INTEGER,operation_time INTEGER)"
    );
  a.pragma("journal_mode=WAL");
  a.pragma("wal_checkpoint(TRUNCATE)");
  database.databases.set("a", a);
  database.databases.set("b", b);
  database.windowToDatabase.set(1, "b");
  let reader: Database.Database | undefined;
  try {
    await database.init();
    const create = paths.handlers.get("content:create")!;
    await create({ sender: {} }, { content: [], count: 1 }, { toolDatabaseName: "a" });
    expect(a.prepare("SELECT COUNT(*) AS n FROM contents").get()).toEqual({ n: 1 });
    expect(b.prepare("SELECT COUNT(*) AS n FROM contents").get()).toEqual({ n: 0 });
    a.pragma("wal_checkpoint(TRUNCATE)");
    reader = new Database(join(paths.root, "a.db"));
    reader.exec("BEGIN");
    reader.prepare("SELECT * FROM contents").all();
    await create({ sender: {} }, { content: [], count: 1 }, { toolDatabaseName: "a" });
    expect(database.forceCheckpoint("a")).toBe(false);
    await expect(paths.handlers.get("close-database")!({}, "a")).rejects.toThrow("不能安全关闭");
    expect(a.open).toBe(true);
    reader.exec("ROLLBACK");
    reader.close();
    reader = undefined;
    expect(database.forceCheckpoint("a")).toBe(true);
  } finally {
    reader?.close();
    a.close();
    b.close();
    database.databases.clear();
    database.windowToDatabase.clear();
    paths.handlers.clear();
    rmSync(paths.root, { recursive: true, force: true });
  }
});

it.each(["connect", "download"])("%s：版本标记缺失不阻止开库且保留旧聊天表", async source => {
  paths.root = mkdtempSync(join(tmpdir(), "pi-legacy-guard-"));
  const file = join(paths.root, "data.db");
  const legacy = new Database(file);
  legacy.exec(
    "CREATE TABLE chat_message(id INTEGER PRIMARY KEY, create_time INTEGER, update_time INTEGER, messages TEXT)"
  );
  legacy.close();
  const { default: database } = await import("../database");
  const { default: indexManager } = await import("../main-content-index-db");
  await database.init();
  const open = vi.spyOn(database, "openDatabase");
  const connect = () =>
    source === "download"
      ? database.reconnectForSync("data", "sync_download_reconnect")
      : paths.handlers.get("create-or-connect-database")!({ sender: {} }, "data");
  try {
    await Promise.all([connect(), connect()]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(database.databases.has("data")).toBe(true);
    // 开库补齐标记，不删除已有业务表。
    const verify = new Database(file);
    try {
      expect(verify.prepare("SELECT COUNT(*) AS n FROM chat_message").get()).toEqual({ n: 0 });
    } finally {
      verify.close();
    }
  } finally {
    open.mockRestore();
    indexManager.closeDatabase("data");
    for (const db of database.databases.values()) if (db.open) db.close();
    database.databases.clear();
    database.windowToDatabase.clear();
    paths.handlers.clear();
    rmSync(paths.root, { recursive: true, force: true });
  }
});
