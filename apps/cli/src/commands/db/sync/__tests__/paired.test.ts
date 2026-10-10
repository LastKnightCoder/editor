import { beforeEach, afterEach, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  copyFileSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYNC_MODEL_VERSION } from "@tau/db-schema/sync-protocol";
import {
  acquireDatabaseSyncLock,
  isDatabaseSyncLocked,
  packSessionDir,
  sessionDirectoryOf,
} from "@tau/db-schema/sync";

const state = vi.hoisted(() => ({
  root: "",
  remote: new Map<string, Uint8Array>(),
  failAt: 0,
  running: false,
  beginFails: false,
  uploads: [] as string[],
  rpc: [] as Array<[string, unknown[]]>,
}));
vi.mock("../../../../utils/path.js", () => ({
  getAppDir: () => state.root,
  getDbPath: (name = "data.db") => join(state.root, name),
  getActiveDbName: () => "data.db",
}));
vi.mock("../../../../utils/sync-providers/factory.js", () => ({
  createSyncProvider: () => ({
    fileExists: async (name: string) => state.remote.has(name),
    downloadFile: async (name: string) => {
      if (!state.remote.has(name)) throw new Error("missing remote");
      return state.remote.get(name)!;
    },
    uploadFile: async (name: string, content: Uint8Array) => {
      state.uploads.push(name);
      if (state.uploads.length === state.failAt) return false;
      state.remote.set(name, content);
      return true;
    },
    createFileIfAbsent: async (name: string, content: Uint8Array) => {
      state.uploads.push(name);
      if (state.uploads.length === state.failAt || state.remote.has(name)) return false;
      state.remote.set(name, content);
      return true;
    },
    getProviderName: () => "test",
  }),
}));
vi.mock("../../../../data-access/notify.js", () => ({
  isAppRunning: async () => state.running,
  notifyApp: vi.fn(),
}));
vi.mock("../../../../data-access/rpc-client.js", () => ({
  rpcRequest: async (method: string, params: unknown[]) => {
    state.rpc.push([method, params]);
    if (method === "cli-sync:begin" && state.beginFails) throw new Error("对话正在运行");
    return method === "cli-sync:begin" ? { token: "lease" } : { ok: true };
  },
}));
import { runSyncPush } from "../push.js";
import { runSyncPull } from "../pull.js";
import { readRemoteInfo } from "../runtime.js";
import { createSyncProvider } from "../../../../utils/sync-providers/factory.js";
import { DataAccess } from "../../../../data-access/index.js";

const schema = readFileSync(
  new URL("../../../../../../../packages/db-schema/schema/main.sql", import.meta.url),
  "utf8"
);
const fileName = "1970-01-01_conversation.jsonl";
const infoKey = "database_data.db.json";
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const decode = (value: Uint8Array) => JSON.parse(Buffer.from(value).toString());
const version = () =>
  JSON.parse(readFileSync(join(state.root, "setting.json"), "utf8")).database.databases[0].version;
const messages = (dir: string) => readFileSync(join(dir, fileName), "utf8");
function createDb(path: string, label: string, chat = true) {
  const db = new Database(path);
  db.exec(schema);
  db.exec("CREATE TABLE snapshot_marker(value TEXT)");
  db.prepare("INSERT INTO snapshot_marker VALUES (?)").run(label);
  if (chat)
    db.prepare(
      "INSERT INTO chat_session(id,scope,session_file,message_count,create_time,update_time) VALUES('conversation','main-chat',?,1,1,1)"
    ).run(fileName);
  db.close();
}
function writeChat(dir: string, label: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, fileName),
    `${JSON.stringify({ type: "session", version: 3, id: "conversation", timestamp: new Date(1).toISOString(), cwd: dir })}\n${JSON.stringify({ type: "message", id: "u", parentId: null, timestamp: new Date(1).toISOString(), message: { role: "user", content: label, timestamp: 1 } })}\n`
  );
}
const marker = () => {
  const db = new Database(join(state.root, "data.db"));
  try {
    return (db.prepare("SELECT value FROM snapshot_marker").get() as { value: string }).value;
  } finally {
    db.close();
  }
};
function seedRemote(chat = true) {
  const path = join(state.root, "remote.db");
  createDb(path, "remote", chat);
  const dir = join(state.root, "remote-sessions");
  writeChat(dir, "remote question");
  state.remote.set("snapshot.db", readFileSync(path));
  state.remote.set("snapshot.zip", packSessionDir(dir));
  state.remote.set(
    infoKey,
    json({
      version: 2,
      dataModelVersion: SYNC_MODEL_VERSION,
      databaseObject: "snapshot.db",
      sessionsObject: "snapshot.zip",
    })
  );
}
beforeEach(() => {
  state.root = mkdtempSync(join(tmpdir(), "cli-paired-sync-"));
  state.remote.clear();
  state.uploads = [];
  state.rpc = [];
  state.running = false;
  state.beginFails = false;
  state.failAt = 0;
  createDb(join(state.root, "data.db"), "local");
  writeChat(sessionDirectoryOf(join(state.root, "data.db")), "local question");
  writeFileSync(
    join(state.root, "setting.json"),
    JSON.stringify({
      database: { active: "data.db", databases: [{ name: "data.db", version: 1 }] },
    })
  );
});
afterEach(() => rmSync(state.root, { recursive: true, force: true }));

it("上传不可变配对对象，最后发布版本，旧对象保持原样", async () => {
  state.remote.set("old.db", Buffer.from("旧快照"));
  state.remote.set(
    infoKey,
    json({ version: 1, dataModelVersion: 2, databaseObject: "old.db", sessionsObject: "old.zip" })
  );
  await runSyncPush();
  const info = decode(state.remote.get(infoKey)!);
  expect(state.uploads).toEqual([
    info.databaseObject,
    info.sessionsObject,
    `${infoKey}.next-1`,
    infoKey,
  ]);
  expect(info).toMatchObject({ version: 2, dataModelVersion: SYNC_MODEL_VERSION });
  expect(state.remote.get("old.db")).toEqual(Buffer.from("旧快照"));
  expect(version()).toBe(2);
  expect(isDatabaseSyncLocked(join(state.root, "data.db"))).toBe(false);
});
it.each([1, 2, 3])("第 %s 次上传失败不发布不完整版本或推进本地版本", async failAt => {
  const original = json({ version: 1 });
  state.remote.set(infoKey, original);
  state.failAt = failAt;
  await expect(runSyncPush()).rejects.toThrow();
  expect(state.uploads).toHaveLength(failAt);
  expect(state.remote.get(infoKey)).toEqual(original);
  expect(version()).toBe(1);
  expect(isDatabaseSyncLocked(join(state.root, "data.db"))).toBe(false);
  expect(readdirSync(state.root).some(name => name.endsWith("upload.tmp"))).toBe(false);
});
it("本地目录表引用了缺失会话时不上传", async () => {
  rmSync(sessionDirectoryOf(join(state.root, "data.db")), { recursive: true });
  await expect(runSyncPush()).rejects.toThrow("缺少文件");
  expect(state.uploads).toEqual([]);
});
it("下载后数据库与 JSONL 同时切换，旧数据库有备份", async () => {
  seedRemote();
  await runSyncPull();
  expect(marker()).toBe("remote");
  expect(messages(sessionDirectoryOf(join(state.root, "data.db")))).toContain("remote question");
  expect(version()).toBe(2);
  expect(readdirSync(state.root).some(name => name.includes("pre-session-sync"))).toBe(true);
});
it.each(["missing", "bad-zip", "missing-entry", "bad-db"])(
  "无效远端快照 %s 保留本地数据与版本",
  async failure => {
    seedRemote();
    if (failure === "missing") state.remote.delete("snapshot.zip");
    if (failure === "bad-zip") state.remote.set("snapshot.zip", Buffer.from("bad zip"));
    if (failure === "missing-entry")
      state.remote.set("snapshot.zip", packSessionDir(join(state.root, "missing")));
    if (failure === "bad-db") state.remote.set("snapshot.db", Buffer.alloc(0));
    await expect(runSyncPull()).rejects.toThrow();
    expect(marker()).toBe("local");
    expect(version()).toBe(1);
    expect(messages(sessionDirectoryOf(join(state.root, "data.db")))).toContain("local question");
  }
);
it("旧协议下载被拒绝并保留本地数据库与会话目录", async () => {
  seedRemote(false);
  const remote = new Database(join(state.root, "remote.db"));
  remote.exec(
    "CREATE TABLE chat_message(id INTEGER, create_time INTEGER, update_time INTEGER, messages TEXT)"
  );
  remote
    .prepare("INSERT INTO chat_message VALUES(1,1,1,?)")
    .run(JSON.stringify([{ role: "user", content: "旧对话" }]));
  remote.close();
  state.remote.set("data.db", readFileSync(join(state.root, "remote.db")));
  state.remote.set(infoKey, json({ version: 2, dataModelVersion: 1 }));
  await expect(runSyncPull()).rejects.toThrow("DB_MODEL_INCOMPATIBLE");
  expect(marker()).toBe("local");
  expect(version()).toBe(1);
  expect(messages(sessionDirectoryOf(join(state.root, "data.db")))).toContain("local question");
});
it("CLI 启动会先恢复上次中断的数据库与会话提交", async () => {
  const path = join(state.root, "data.db");
  const dir = sessionDirectoryOf(path);
  copyFileSync(path, `${path}.backup`);
  renameSync(dir, `${dir}.backup`);
  const db = new Database(path);
  db.prepare("UPDATE snapshot_marker SET value='未提交的数据'").run();
  db.close();
  writeChat(dir, "未提交的会话");
  writeFileSync(
    `${path}.session-sync.json`,
    JSON.stringify({
      databaseBackup: `${path}.backup`,
      sessionDir: dir,
      sessionsBackup: `${dir}.backup`,
      hadSessions: true,
      stage: `${dir}.stage`,
    })
  );
  await runSyncPush();
  expect(marker()).toBe("local");
  expect(messages(dir)).toContain("local question");
});
it("相同版本也能用远端配对快照修复缺失文件", async () => {
  seedRemote();
  state.remote.set(infoKey, json({ ...decode(state.remote.get(infoKey)!), version: 1 }));
  rmSync(sessionDirectoryOf(join(state.root, "data.db")), { recursive: true });
  await runSyncPull();
  expect(marker()).toBe("remote");
  expect(version()).toBe(1);
});
it("桌面运行时先协调关闭，版本交给主进程保存，最后重连", async () => {
  state.running = true;
  await runSyncPush();
  expect(state.rpc).toEqual([
    ["cli-sync:begin", ["data.db", "push"]],
    ["cli-sync:version", ["lease", 2]],
    ["cli-sync:finish", ["lease"]],
  ]);
  expect(version()).toBe(1);
});
it("桌面有运行中回答时拒绝同步并释放文件锁", async () => {
  state.running = true;
  state.beginFails = true;
  await expect(runSyncPush()).rejects.toThrow("对话正在运行");
  expect(state.uploads).toEqual([]);
  expect(isDatabaseSyncLocked(join(state.root, "data.db"))).toBe(false);
});
it("另一个同步者持锁时，CLI 同步与普通数据库访问都被拒绝", async () => {
  const release = acquireDatabaseSyncLock(join(state.root, "data.db"));
  try {
    await expect(runSyncPush()).rejects.toThrow("正在同步");
    expect(() => new DataAccess("data.db")).toThrow("正在同步");
  } finally {
    release();
  }
});
it.skipIf(process.platform === "win32")("已打开的 CLI 连接在文件被替换后拒绝写回旧数据库", () => {
  const access = new DataAccess("data.db");
  try {
    access.getDatabase().pragma("wal_checkpoint(TRUNCATE)");
    const replacement = join(state.root, "replacement.db");
    createDb(replacement, "replacement");
    renameSync(replacement, join(state.root, "data.db"));
    expect(() => access.exec("UPDATE snapshot_marker SET value='错误写入'")).toThrow("同步替换");
  } finally {
    access.close();
  }
  expect(marker()).toBe("replacement");
});
it("状态读取接受新信封并拒绝未来版本", async () => {
  seedRemote();
  expect((await readRemoteInfo(createSyncProvider()!, "data.db")).version).toBe(2);
  state.remote.set(infoKey, json({ version: 3, dataModelVersion: 99 }));
  await expect(readRemoteInfo(createSyncProvider()!, "data.db")).rejects.toThrow();
});

it("协议 3 可读取版本并上传新快照，但不能下载旧快照", async () => {
  seedRemote();
  state.remote.set(
    infoKey,
    json({ ...decode(state.remote.get(infoKey)!), version: 1, dataModelVersion: 3 })
  );
  expect((await readRemoteInfo(createSyncProvider()!, "data.db")).version).toBe(1);
  await expect(runSyncPull()).rejects.toThrow("DB_MODEL_INCOMPATIBLE");
  expect(marker()).toBe("local");
  await runSyncPush();
  expect(decode(state.remote.get(infoKey)!)).toMatchObject({
    version: 2,
    dataModelVersion: SYNC_MODEL_VERSION,
  });
});
