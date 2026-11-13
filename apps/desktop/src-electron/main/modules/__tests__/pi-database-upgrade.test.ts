import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { installDatabaseDownload } from "../database-download";
const paths = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (...args: any[]) => any>(),
  embed: vi.fn(async (_config: unknown, texts: string[]) => texts.map(() => [1, 0])),
}));
vi.mock("../embedding-service", () => ({ default: { embedTexts: paths.embed } }));
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
    fromWebContents: (sender: { id?: number }) => ({ id: sender.id ?? 1 }),
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
    const scope = {
      toolDatabaseName: "a",
      toolDatabaseConnection: database.commandConnection("a").connectionId,
    };
    await create({ sender: {} }, { content: [], count: 1 }, scope);
    expect(a.prepare("SELECT COUNT(*) AS n FROM contents").get()).toEqual({ n: 1 });
    expect(b.prepare("SELECT COUNT(*) AS n FROM contents").get()).toEqual({ n: 0 });
    a.pragma("wal_checkpoint(TRUNCATE)");
    reader = new Database(join(paths.root, "a.db"));
    reader.exec("BEGIN");
    reader.prepare("SELECT * FROM contents").all();
    await create({ sender: {} }, { content: [], count: 1 }, scope);
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

it("覆盖拒绝其他窗口及重载后迟到的旧请求，重连不切换活动库", async () => {
  paths.root = mkdtempSync(join(tmpdir(), "database-overwrite-"));
  const { default: database } = await import("../database");
  const { default: indexManager } = await import("../main-content-index-db");
  await database.init();
  const connect = paths.handlers.get("create-or-connect-database")!;
  const save = paths.handlers.get("home-layout:save")!;
  const a = { sender: { id: 1 } },
    b = { sender: { id: 2 } };
  try {
    const original = await connect(a, "A.db", false, "normal");
    await database.closeForSync("A.db");
    const uploaded = await connect(a, "A.db", false, "normal", "sync_upload_reconnect");
    expect(uploaded.connectionId).toBe(original.connectionId);
    await connect(b, "B.db", false, "normal");
    const old = database.getDatabase("A.db")!;
    const queued = {
      toolDatabaseName: "A.db",
      toolDatabaseConnection: original.connectionId,
    };
    await save(b, [{ id: "旧修改", hidden: false }], queued);
    const candidate = database.openDatabase("candidate.db", "normal");
    candidate.prepare("INSERT INTO home_panel_layout VALUES('协调端',0,0,1)").run();
    candidate.close();
    await database.closeForSync("A.db", true);
    installDatabaseDownload(join(paths.root, "A.db"), join(paths.root, "candidate.db"), "");
    await database.reconnectForSync("A.db", "sync_download_reconnect");
    expect(old.open).toBe(false);
    expect(database.getCurrentDatabaseName()).toBe("B.db");
    expect(database.windowToDatabase.get(2)).toBe("B.db");
    await expect(save(b, [{ id: "旧修改", hidden: false }], queued)).rejects.toThrow(
      "CONNECTION_CHANGED"
    );
    await expect(save(b, [], { toolDatabaseName: "A.db" })).rejects.toThrow("CONNECTION_CHANGED");
    expect(
      database.getDatabase("A.db")!.prepare("SELECT panel_id FROM home_panel_layout").all()
    ).toEqual([{ panel_id: "协调端" }]);
    const current = await connect(a, "A.db", false, "normal");
    expect(database.getCurrentDatabaseName()).toBe("B.db");
    await expect(save(a, [], queued)).rejects.toThrow("CONNECTION_CHANGED");
    await save(a, [{ id: "新编辑", hidden: false }], {
      toolDatabaseName: "A.db",
      toolDatabaseConnection: current.connectionId,
    });
    expect(
      database.getDatabase("A.db")!.prepare("SELECT panel_id FROM home_panel_layout").all()
    ).toEqual([{ panel_id: "新编辑" }]);
  } finally {
    for (const [name, db] of database.databases) {
      indexManager.closeDatabase(name);
      if (db.open) db.close();
    }
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

it("同内容覆盖复用向量，原始字段变化后只补变化条目", async () => {
  paths.root = mkdtempSync(join(tmpdir(), "database-download-index-"));
  const { default: database } = await import("../database");
  const { default: indexManager } = await import("../main-content-index-db");
  const { default: queue } = await import("../main-content-vec-index-queue");
  const { default: ContentTable } = await import("../tables/content");
  const { resolveEmbeddingConfig } = await import("../../utils/embedding-config");
  const file = join(paths.root, "data.db");
  const staged = `${file}.download.tmp`;
  const setting = {
    embedding: {
      active: { provider: "local" as const, model: "test", dimensions: 2 },
      local: { source: "modelscope" as const, batchSize: 8, devicePolicy: "auto" as const },
      plugins: {},
    },
  };
  writeFileSync(join(paths.root, "setting.json"), JSON.stringify(setting));
  const embeddingConfig = resolveEmbeddingConfig(setting);
  if (!embeddingConfig) throw new Error("测试嵌入配置无效");
  const read = vi.spyOn(ContentTable, "readText").mockImplementation(async (_db, id) => ({
    content: `正文 ${id}`,
    sections: [
      {
        chunkIndex: 0,
        headingPath: "",
        text: `正文 ${id}`,
        blockStart: 0,
        blockEnd: 0,
        charCount: 4,
        embeddingText: `正文 ${id}`,
      },
    ],
  }));
  let main = database.openDatabase("data.db", "normal");
  try {
    main.exec(`
      INSERT INTO contents(id,create_time,update_time,content) VALUES
        (1,1,1,'["旧正文"]'), (2,1,1,'["相同正文"]'), (3,1,1,'["要删除"]');
      INSERT INTO cards(id,create_time,update_time,content_id) VALUES
        (1,1,1,1), (2,1,1,2), (3,1,1,3);
    `);
    main.prepare("VACUUM INTO ?").run(staged);
    main.close();
    const index = indexManager.getDatabase("data.db");
    index.exec(`
      INSERT INTO vec_documents(prefixed_id,update_time,content,type,chunk_index,vec_embedding)
      VALUES ('card:1',1.0,'旧正文','card',0,'[1,0]'),
             ('card:2',1.0,'相同正文','card',0,'[1,0]'),
             ('card:3',1.0,'要删除','card',0,'[1,0]');
      INSERT INTO content_sections VALUES ('card:2',1,0,'',0,0,4,'相同正文');
    `);
    indexManager.closeDatabase("data.db");
    rmSync(join(paths.root, "setting.json"));
    indexManager.ensureReady("data.db");
    expect(
      indexManager
        .getDatabase("data.db")
        .prepare("SELECT count(*) FROM vec_documents")
        .pluck()
        .get()
    ).toBe(3);
    indexManager.closeDatabase("data.db");

    const install = () => {
      indexManager.prepareDownload("data.db", file, staged);
      installDatabaseDownload(file, staged, "");
      main = database.openDatabase("data.db", "normal");
      database.databases.set("data.db", main);
    };
    const reconcile = () =>
      queue.reconcileByPolicy({
        mainDbName: "data.db",
        embeddingConfig,
        fingerprintChanged: false,
        autoIndex: true,
        reason: "sync_download_reconnect",
      });
    paths.embed.mockClear();
    install();
    expect(await reconcile()).toMatchObject({ queued: 0, indexed: 0 });
    expect(read).not.toHaveBeenCalled();
    expect(paths.embed).not.toHaveBeenCalled();

    main.prepare("VACUUM INTO ?").run(staged);
    main.close();
    database.databases.delete("data.db");
    indexManager.closeDatabase("data.db");
    const candidate = new Database(staged);
    candidate.exec(`
      UPDATE contents SET content='["变更正文"]' WHERE id=1;
      UPDATE contents SET update_time=2 WHERE id=2;
      DELETE FROM cards WHERE id=3;
    `);
    candidate.close();
    install();
    const installed = indexManager.getDatabase("data.db");
    expect(installed.prepare("SELECT prefixed_id,update_time FROM vec_documents").all()).toEqual([
      { prefixed_id: "card:2", update_time: 2 },
    ]);
    expect(
      installed
        .prepare("SELECT update_time FROM content_sections WHERE prefixed_id='card:2'")
        .pluck()
        .get()
    ).toBe(2);
    expect(await reconcile()).toMatchObject({ queued: 1, indexed: 1 });
    expect(paths.embed).toHaveBeenCalledTimes(1);
  } finally {
    read.mockRestore();
    if (main.open) main.close();
    indexManager.closeDatabase("data.db");
    database.databases.delete("data.db");
    rmSync(paths.root, { recursive: true, force: true });
  }
});
