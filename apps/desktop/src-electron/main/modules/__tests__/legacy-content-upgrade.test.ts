// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LegacyContentUpgradeModule } from "../legacy-content-upgrade";

const mocks = vi.hoisted(() => ({
  databases: new Map<string, any>(),
  connected: undefined as any,
  state: { pendingMigrations: vi.fn(), preparations: vi.fn() },
  store: undefined as any,
  readSetting: vi.fn(),
  openDatabase: vi.fn(),
  isLegacyUpgrade: vi.fn(),
  shared: vi.fn(),
  content: vi.fn(),
  board: vi.fn(),
  notify: vi.fn(),
  prepare: undefined as any,
}));
vi.mock("electron", () => ({ shell: { openPath: vi.fn() } }));
vi.mock("../database", () => ({
  default: {
    databases: mocks.databases,
    openDatabase: mocks.openDatabase,
    formatDatabaseName: (name: string) => name.replace(/\.db$/, ""),
    getDatabase: (name: string) => mocks.databases.get(name),
    onDatabaseConnected: (callback: unknown) => {
      mocks.connected = callback;
    },
  },
}));
vi.mock("../setting", () => ({ default: { readSetting: mocks.readSetting } }));
vi.mock("../collaboration", () => ({
  default: {
    documentMigration: () => ({ state: mocks.state, store: mocks.store }),
    upgradeLegacyContent: mocks.content,
    upgradeLegacySession: mocks.shared,
    isLegacyUpgrade: mocks.isLegacyUpgrade,
    isLegacySession: () => true,
    legacySessions: () => [],
    onLegacyContent: vi.fn(),
  },
}));
vi.mock("../whiteboard-documents", () => ({ default: { upgradeLegacyWhiteboard: mocks.board } }));
vi.mock("../../services/content-execution", () => ({
  contentExecutor: { execute: async () => ({}) },
}));
vi.mock("../durable-document-lifecycle", () => ({
  registerDurableDocuments: (provider: any) => {
    mocks.prepare = provider.prepare;
  },
}));
vi.mock("../../windows/notification-router", () => ({ routeNotification: mocks.notify }));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => "/tmp" } }));
vi.mock("node:fs", async importOriginal => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  existsSync: () => true,
}));
let db: Database.Database, state: Database.Database;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSetting.mockResolvedValue("{}");
  db = new Database(":memory:");
  state = new Database(":memory:");
  db.exec(`CREATE TABLE contents(id INTEGER PRIMARY KEY); CREATE TABLE content_documents(content_id INTEGER PRIMARY KEY,format_version INTEGER DEFAULT 2);
    CREATE TABLE white_board_contents(id INTEGER PRIMARY KEY); CREATE TABLE whiteboard_document_pages(content_id INTEGER PRIMARY KEY); CREATE TABLE white_boards(id INTEGER PRIMARY KEY,white_board_content_ids TEXT); CREATE TABLE whiteboard_documents(board_id INTEGER);`);
  state.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)");
  mocks.databases.set("A", db);
  mocks.store = {
    db: state,
    failures: new Map(),
    list: () => [],
    set: (key: string, value: unknown) =>
      state.prepare("INSERT OR REPLACE INTO settings VALUES(?,?)").run(key, JSON.stringify(value)),
  };
  mocks.state.pendingMigrations.mockReturnValue([]);
  mocks.state.preparations.mockReturnValue([]);
  mocks.shared.mockResolvedValue(undefined);
  mocks.isLegacyUpgrade.mockReturnValue(true);
  mocks.content.mockImplementation(async (_name, id) => {
    mocks.databases
      .get(_name)
      .prepare("INSERT OR IGNORE INTO content_documents(content_id) VALUES(?)")
      .run(id);
  });
  mocks.board.mockImplementation(async (_name, id) => {
    mocks.databases
      .get(_name)
      .prepare("INSERT OR IGNORE INTO whiteboard_document_pages VALUES(?)")
      .run(id);
  });
});
afterEach(() => {
  for (const database of mocks.databases.values()) if (database.open) database.close();
  state.close();
  mocks.databases.clear();
});
const finished = () =>
  expect(
    state.prepare("SELECT value FROM settings WHERE key='legacy-content-upgrade:A'").get()
  ).toBeTruthy();

it("启动自动分页升级未打开的正文、白板和内嵌页，不发送成功通知", async () => {
  for (let id = 1; id <= 35; id++) db.prepare("INSERT INTO contents VALUES(?)").run(id);
  db.exec("INSERT INTO white_board_contents VALUES(1),(2)");
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(finished, { timeout: 4000 });
  expect(mocks.content).toHaveBeenCalledTimes(35);
  expect(mocks.board).toHaveBeenCalledTimes(2);
  expect(mocks.notify).not.toHaveBeenCalled();
});

it("重启时主库已安装的正文和白板仍沿未完成回执续做", async () => {
  db.exec(
    "INSERT INTO contents VALUES(1); INSERT INTO content_documents(content_id) VALUES(1); INSERT INTO white_board_contents VALUES(2); INSERT INTO whiteboard_document_pages VALUES(2)"
  );
  mocks.state.pendingMigrations.mockReturnValue([
    { plan: { workspaceId: "A", documentId: "pending-content" } },
    {
      plan: {
        kind: "whiteboard",
        workspaceId: "A",
        prepared: {
          installation: JSON.stringify({ beforeHash: null, target: { pages: [{ contentId: 2 }] } }),
        },
      },
    },
  ]);
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(finished);
  expect(mocks.shared).toHaveBeenCalledWith("A", "pending-content", {});
  expect(mocks.board).toHaveBeenCalledWith("A", 2, {});
});

it("真实异常集中通知且不把失败记录为完成，其他内容仍完成升级", async () => {
  db.exec("INSERT INTO contents VALUES(1),(2); INSERT INTO white_board_contents VALUES(3)");
  mocks.content.mockImplementation(async (_name, id) => {
    if (id === 1) throw new Error("磁盘空间不足，无法保全");
    db.prepare("INSERT INTO content_documents(content_id) VALUES(?)").run(id);
  });
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(finished);
  const report = JSON.parse(
    (
      state.prepare("SELECT value FROM settings WHERE key='legacy-content-upgrade:A'").get() as {
        value: string;
      }
    ).value
  );
  expect(report.complete).toBe(false);
  expect(report.failures).toEqual([{ key: "content:1", message: "磁盘空间不足，无法保全" }]);
  expect(mocks.notify).toHaveBeenCalledTimes(1);
  expect(mocks.board).toHaveBeenCalledWith("A", 3, {});
});

it("设置中的未打开本地资料库也自动连接升级，不要求切换窗口", async () => {
  const second = new Database(":memory:");
  second.exec(
    "CREATE TABLE contents(id INTEGER PRIMARY KEY); CREATE TABLE content_documents(content_id INTEGER PRIMARY KEY,format_version INTEGER DEFAULT 2); CREATE TABLE white_board_contents(id INTEGER PRIMARY KEY); CREATE TABLE whiteboard_document_pages(content_id INTEGER PRIMARY KEY); CREATE TABLE white_boards(id INTEGER PRIMARY KEY,white_board_content_ids TEXT); CREATE TABLE whiteboard_documents(board_id INTEGER); INSERT INTO contents VALUES(9)"
  );
  mocks.readSetting.mockResolvedValue(
    JSON.stringify({ database: { databases: [{ name: "B.db" }] } })
  );
  mocks.openDatabase.mockReturnValue(second);
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(() =>
    expect(
      state.prepare("SELECT value FROM settings WHERE key='legacy-content-upgrade:B.db'").get()
    ).toBeTruthy()
  );
  expect(mocks.openDatabase).toHaveBeenCalledWith("B.db", "normal");
  expect(mocks.content).toHaveBeenCalledWith("B.db", 9, {});
});

it("没有本地主库来源的未决操作与 PREPARING 记录也必须续做", async () => {
  mocks.state.pendingMigrations.mockReturnValue([
    { plan: { workspaceId: "A", documentId: "shared-pending" } },
  ]);
  mocks.state.preparations.mockReturnValue([{ workspaceId: "A", documentId: "shared-preparing" }]);
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(finished);
  expect(mocks.shared).toHaveBeenCalledWith("A", "shared-pending", {});
  expect(mocks.shared).toHaveBeenCalledWith("A", "shared-preparing", {});
  const report = JSON.parse(
    (
      state.prepare("SELECT value FROM settings WHERE key='legacy-content-upgrade:A'").get() as {
        value: string;
      }
    ).value
  );
  expect(report.complete).toBe(false);
  expect(report.remaining.operations).toBe(2);
});

it("旧白板目录没有页面时明确报告，不以未扫到页认定升级完成", async () => {
  db.exec("INSERT INTO white_boards VALUES(7,'[]')");
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(finished);
  const report = JSON.parse(
    (
      state.prepare("SELECT value FROM settings WHERE key='legacy-content-upgrade:A'").get() as {
        value: string;
      }
    ).value
  );
  expect(report.complete).toBe(false);
  expect(report.remaining.boards).toBe(1);
  expect(report.failures[0]).toMatchObject({ key: "whiteboard-owner:7" });
  expect(db.prepare("SELECT white_board_content_ids FROM white_boards WHERE id=7").get()).toEqual({
    white_board_content_ids: "[]",
  });
});

it("扫描之后新增的旧正文由完成前核对发现，不误报完成", async () => {
  db.exec("INSERT INTO white_board_contents VALUES(9)");
  mocks.board.mockImplementation(async () => {
    db.exec("INSERT INTO whiteboard_document_pages VALUES(9); INSERT INTO contents VALUES(100)");
  });
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(finished);
  const report = JSON.parse(
    (
      state.prepare("SELECT value FROM settings WHERE key='legacy-content-upgrade:A'").get() as {
        value: string;
      }
    ).value
  );
  expect(report.complete).toBe(false);
  expect(report.remaining.contents).toBe(1);
  expect(mocks.notify).not.toHaveBeenCalled();
});

it("损坏的缓存元数据进入异常清单，不能被成功扫描掩盖", async () => {
  mocks.store.failures.set("broken", "协作缓存元数据不可读，原数据已保留");
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(finished);
  const report = JSON.parse(
    (
      state.prepare("SELECT value FROM settings WHERE key='legacy-content-upgrade:A'").get() as {
        value: string;
      }
    ).value
  );
  expect(report.complete).toBe(false);
  expect(report.failures).toContainEqual({
    key: "cache:broken",
    message: "协作缓存元数据不可读，原数据已保留",
  });
});

it("切库暂停期间定时重试不能重新打开数据库", async () => {
  vi.useFakeTimers();
  try {
    mocks.readSetting.mockResolvedValue(
      JSON.stringify({ database: { databases: [{ name: "B.db" }] } })
    );
    mocks.openDatabase.mockImplementation(() => {
      throw new Error("网络暂时失败");
    });
    await new LegacyContentUpgradeModule().init();
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.openDatabase).toHaveBeenCalledTimes(1);
    const drain = await mocks.prepare({ reason: "database-change", databaseName: "B.db" });
    await vi.advanceTimersByTimeAsync(60_100);
    expect(mocks.openDatabase).toHaveBeenCalledTimes(1);
    drain.commit();
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.openDatabase).toHaveBeenCalledTimes(1);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

it("异常版本标记与非正整数旧 ID 也不能从扫描中消失", async () => {
  db.exec("INSERT INTO contents VALUES(0),(8); INSERT INTO content_documents VALUES(8,1)");
  mocks.content.mockImplementation(async (_name, id) => {
    throw new Error(id === 0 ? "内容 ID 不合法" : "正文数据格式不兼容");
  });
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(finished);
  expect(mocks.content).toHaveBeenCalledWith("A", 0, {});
  expect(mocks.content).toHaveBeenCalledWith("A", 8, {});
  const report = JSON.parse(
    (
      state.prepare("SELECT value FROM settings WHERE key='legacy-content-upgrade:A'").get() as {
        value: string;
      }
    ).value
  );
  expect(report.complete).toBe(false);
  expect(report.remaining.contents).toBe(2);
});

it("后台旧格式扫描不能擅自提交当前格式的插件版本更新", async () => {
  mocks.state.pendingMigrations.mockReturnValue([
    { plan: { workspaceId: "A", documentId: "plugin-upgrade" } },
  ]);
  mocks.isLegacyUpgrade.mockReturnValue(false);
  await new LegacyContentUpgradeModule().init();
  await vi.waitFor(finished);
  expect(mocks.shared).not.toHaveBeenCalled();
});
