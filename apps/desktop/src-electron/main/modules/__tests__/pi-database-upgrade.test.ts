import { expect, it, vi } from "vitest";
import { mkdtempSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SessionManager } from "@earendil-works/pi-coding-agent";
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

it.each(["connect", "download"])("%s：最后迁移失败拒绝连接，修复后重试完成退役", async source => {
  paths.root = mkdtempSync(join(tmpdir(), "pi-last-upgrade-"));
  const file = join(paths.root, "data.db");
  const legacy = new Database(file);
  legacy.exec(
    "CREATE TABLE chat_message(id INTEGER PRIMARY KEY, create_time INTEGER, update_time INTEGER, messages TEXT); INSERT INTO chat_message VALUES(1, 1, 1, '{坏JSON')"
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
    await expect(Promise.all([connect(), connect()])).rejects.toThrow("聊天数据迁移失败");
    expect(open).toHaveBeenCalledTimes(1);
    expect(database.databases.has("data")).toBe(false);
    expect(database.windowToDatabase.has(1)).toBe(false);
    const retry = new Database(file);
    try {
      expect(retry.prepare("SELECT messages FROM chat_message WHERE id=1").get()).toEqual({
        messages: "{坏JSON",
      });
      expect(
        retry.prepare("SELECT value FROM migration_meta WHERE key='chat-session-pi-jsonl:v1'").get()
      ).toBeUndefined();
      retry
        .prepare("UPDATE chat_message SET messages=? WHERE id=1")
        .run(JSON.stringify([{ role: "user", content: "已修复" }]));
    } finally {
      retry.close();
    }
    await Promise.all([connect(), connect()]);
    expect(open).toHaveBeenCalledTimes(2);
    const ready = database.databases.get("data")!;
    expect(ready.open).toBe(true);
    expect(
      ready.prepare("SELECT name FROM sqlite_master WHERE name='chat_message'").get()
    ).toBeUndefined();
    expect(ready.prepare("SELECT COUNT(*) AS n FROM chat_session").get()).toEqual({ n: 1 });
    await database.ensureIndexDatabaseReady("data");
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

it.for(["合成旧库", "真实备份副本"])(
  "%s完整升级、重跑并与新库比对",
  { timeout: 120_000 },
  async (source, context) => {
    if (source === "真实备份副本" && !process.env.PI_UPGRADE_BACKUP) context.skip();
    paths.root = mkdtempSync(join(tmpdir(), "pi-upgrade-"));
    const databasePath = join(paths.root, "data.db");
    if (source === "真实备份副本") {
      copyFileSync(process.env.PI_UPGRADE_BACKUP!, databasePath);
    } else {
      const fixture = new Database(databasePath);
      try {
        fixture.exec(`
          CREATE TABLE chat_message (
            id INTEGER PRIMARY KEY, create_time INTEGER, update_time INTEGER,
            messages TEXT, parent_chat_id INTEGER
          )
        `);
        const prefix = [
          { role: "user", content: "共同问题" },
          { role: "assistant", content: "共同回答" },
        ];
        const insert = fixture.prepare("INSERT INTO chat_message VALUES (?, 1, 2, ?, ?)");
        insert.run(
          1,
          JSON.stringify([
            ...prefix,
            { role: "user", content: "主线问题" },
            { role: "assistant", content: "主线回答" },
          ]),
          null
        );
        insert.run(
          2,
          JSON.stringify([
            ...prefix,
            { role: "user", content: "分支问题" },
            { role: "assistant", content: "分支回答" },
          ]),
          1
        );
      } finally {
        fixture.close();
      }
    }
    const { default: database } = await import("../database");
    const { default: indexManager } = await import("../main-content-index-db");
    const { loadSessionTranscript, transcriptOf } = await import("../pi-session-host-core");
    const { piEntriesToDesktopMessages } = await import("../pi-session-transcript");
    const { LEGACY_CHAT_SOURCES, CHAT_SESSION_MIGRATION_KEY } =
      await import("../chat-session-migration");
    const legacy = database.openDatabase("data", "maintenance");
    database.databases.set("data", legacy);
    const migrate = (
      database as unknown as {
        migrateChatSessions(db: Database.Database, name: string, path: string): Promise<void>;
      }
    ).migrateChatSessions.bind(database);
    let fresh: Database.Database | undefined;
    try {
      const originals = LEGACY_CHAT_SOURCES.flatMap(({ table }) => {
        if (!legacy.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(table)) return [];
        const columns = new Set(
          (legacy.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
            column => column.name
          )
        );
        const rows = legacy
          .prepare(
            `SELECT id, messages, ${columns.has("parent_chat_id") ? "parent_chat_id" : "NULL"} AS parent FROM ${table} ${columns.has("source") ? "WHERE source IS NULL OR source != 'browser'" : ""}`
          )
          .all() as Array<{ id: number; messages: string; parent: number | null }>;
        return rows.map(row => ({
          ...row,
          table,
          messages: JSON.parse(row.messages || "[]") as Array<Record<string, any>>,
        }));
      });
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
      for (const original of originals) {
        let source = original;
        let directory: { session_file: string } | undefined;
        const seen = new Set<number>();
        while (!seen.has(source.id)) {
          seen.add(source.id);
          const mark = legacy
            .prepare("SELECT value FROM migration_meta WHERE key=?")
            .get(`${CHAT_SESSION_MIGRATION_KEY}:${source.table}:${source.id}`) as {
            value: string;
          };
          expect(Boolean(mark), `缺少源行身份：${source.table}:${source.id}`).toBe(true);
          directory = legacy
            .prepare("SELECT session_file FROM chat_session WHERE id=?")
            .get(mark.value) as typeof directory;
          if (directory || source.parent === null) break;
          const parent = originals.find(
            row => row.table === source.table && row.id === source.parent
          );
          if (!parent) break;
          source = parent;
        }
        expect(Boolean(directory), `源行没有可恢复的会话：${original.table}:${original.id}`).toBe(
          true
        );
        const manager = SessionManager.open(
          join(paths.root, "sessions", "data", directory!.session_file)
        );
        const entries = manager.getEntries();
        const parents = new Set(entries.map(entry => entry.parentId));
        const leaves = entries.filter(entry => !parents.has(entry.id));
        const projections = leaves.length
          ? leaves.map(leaf =>
              piEntriesToDesktopMessages(
                transcriptOf({
                  getEntries: () => entries,
                  getBranch: () => manager.getBranch(leaf.id),
                })
              )
            )
          : [[]];
        const content = (value: unknown) =>
          typeof value === "string" ? [{ type: "text", text: value }] : value;
        const expectedUsers = original.messages
          .filter(message => message.role === "user")
          .map(message => content(message.content));
        const matching = projections.filter(
          messages =>
            JSON.stringify(
              messages
                .filter(message => message.role === "user")
                .map(message => content(message.content))
            ) === JSON.stringify(expectedUsers)
        );
        expect(matching.length > 0, `用户消息序列不一致：${original.table}:${original.id}`).toBe(
          true
        );
        for (const message of original.messages.filter(message => message.role === "assistant")) {
          if (typeof message.content === "string" && message.content.trim()) {
            expect(
              matching.some(messages =>
                messages.some(
                  projected =>
                    projected.role === "assistant" &&
                    typeof projected.content === "string" &&
                    projected.content.includes(message.content)
                )
              ),
              `助手正文未保留：${original.table}:${original.id}`
            ).toBe(true);
          }
          const outputs = [
            ...(message.assistant_blocks ?? []).map((block: any) => block.execution?.output),
            ...(message.tool_executions ?? []).map((execution: any) => execution.output),
          ].filter((output: unknown) => typeof output === "string" && output.length > 0);
          for (const output of outputs)
            expect(
              matching.some(messages =>
                JSON.stringify(messages).includes(JSON.stringify(output).slice(1, -1))
              ),
              `工具输出未保留：${original.table}:${original.id}`
            ).toBe(true);
        }
      }
      fresh = database.openDatabase("fresh", "maintenance");
      database.databases.set("fresh", fresh);
      await migrate(fresh, "fresh", join(paths.root, "fresh.db"));
      await database.ensureIndexDatabaseReady("fresh");
      expect(schemaOf(legacy)).toEqual(schemaOf(fresh));
      console.log(
        `升级对账通过：${before.length} 个会话，逐条核对 ${originals.length} 条源对话的用户消息、助手正文和工具输出，失败行 0，结构与新库一致`
      );
    } finally {
      indexManager.closeDatabase("data");
      indexManager.closeDatabase("fresh");
      legacy.close();
      fresh?.close();
      database.databases.clear();
      rmSync(paths.root, { recursive: true, force: true });
    }
  }
);
