/**
 * 会话存储层（M4）：扩展对话按目录列出/改名/删除（全部取自 pi 会话文件本身，无索引表），
 * 页面键的规范化与防路径穿越，以及同步用的会话目录打包/解包（含整体备份与失败回滚）。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import Database from "better-sqlite3";
import { validateSessionReferences } from "@tau/db-schema/sync";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listSessionsInDir,
  validateSessionDirectory,
  installSessionDownload,
  recoverSessionDownload,
} from "../pi-session-store";
import { browserPageKey, browserSessionDirOf, normalizePageUrl } from "../pi-session-paths";
import { writeSessionFile } from "../pi-session-files";

const workDirs: string[] = [];
afterEach(() => {
  for (const dir of workDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-store-"));
  workDirs.push(dir);
  return dir;
};

const assistant = (text: string, at: number) => ({
  role: "assistant" as const,
  content: [{ type: "text" as const, text }],
  api: "openai-completions" as const,
  provider: "p",
  model: "m",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: "stop" as const,
  timestamp: at,
});

/** 在目录里写一个一问一答的对话 */
const writeChat = (sessionDir: string, sessionId: string, question: string) =>
  writeSessionFile({
    sessionDir,
    sessionId,
    cwd: sessionDir,
    createdAt: 1,
    messages: [
      {
        message: { role: "user", content: question, timestamp: 1 },
        display: { modelText: question, content: [{ type: "text", text: question }] },
      },
      { message: assistant("答", 2) },
    ],
  });

describe("数据库与会话成对提交", () => {
  it("目录身份不匹配或非空对话只剩头部时拒绝安装", () => {
    const dir = setup();
    const file = join(dir, "data.db");
    const db = new Database(file);
    db.exec(
      "CREATE TABLE chat_session (id TEXT, session_file TEXT, message_count INTEGER); INSERT INTO chat_session VALUES ('expected', 'chat.jsonl', 10)"
    );
    db.close();
    for (const id of ["wrong", "expected"]) {
      writeFileSync(
        join(dir, "chat.jsonl"),
        JSON.stringify({ type: "session", version: 3, id }) + "\n"
      );
      expect(() =>
        validateSessionReferences(file, dir, path => new Database(path, { readonly: true }))
      ).toThrow("身份不一致");
    }
  });

  it("截断会话不覆盖已有数据库和会话", () => {
    const root = setup();
    const file = join(root, "data.db");
    const source = join(root, "source");
    const target = join(root, "sessions");
    const local = writeChat(target, "local", "本地内容");
    const remote = writeChat(source, "remote", "远端内容");
    const db = new Database(file);
    db.exec("CREATE TABLE chat_session(id TEXT,session_file TEXT,message_count INTEGER)");
    db.prepare("INSERT INTO chat_session VALUES(?,?,?)").run("remote", remote, 1);
    db.close();
    copyFileSync(file, `${file}.download.tmp`);
    const header = readFileSync(join(source, remote), "utf8").split("\n")[0];
    writeFileSync(join(source, remote), header + "\n");
    expect(() => installSessionDownload(file, target, source)).toThrow("身份不一致");
    expect(existsSync(join(target, local))).toBe(true);
  });

  it("重复条目与悬空父节点不进入快照", () => {
    const dir = setup();
    const name = writeChat(dir, "source", "问题");
    const lines = readFileSync(join(dir, name), "utf8").trim().split("\n");
    writeFileSync(join(dir, name), `${lines.join("\n")}\n${lines[1]}\n`);
    expect(() => validateSessionDirectory(dir)).toThrow("会话树");
    const entry = JSON.parse(lines[1]);
    entry.parentId = "missing";
    writeFileSync(join(dir, name), `${lines[0]}\n${JSON.stringify(entry)}\n`);
    expect(() => validateSessionDirectory(dir)).toThrow("会话树");
  });
  const writeDb = (file: string, marker: string) => {
    const db = new Database(file);
    db.exec("CREATE TABLE marker(value TEXT)");
    db.prepare("INSERT INTO marker VALUES (?)").run(marker);
    db.close();
  };
  const markerOf = (file: string) => {
    const db = new Database(file, { readonly: true });
    try {
      return (db.prepare("SELECT value FROM marker").get() as { value: string }).value;
    } finally {
      db.close();
    }
  };
  it("坏包不会替换数据库或删除现有会话", () => {
    const dir = setup();
    const file = join(dir, "data.db");
    const sessions = join(dir, "sessions");
    writeDb(file, "local");
    writeDb(`${file}.download.tmp`, "remote");
    const name = writeChat(sessions, "local", "本地问题");
    expect(() => installSessionDownload(file, sessions, join(dir, "missing"))).toThrow();
    expect(markerOf(file)).toBe("local");
    expect(existsSync(join(sessions, name))).toBe(true);
  });
  it("开库恢复中断的提交，同时恢复数据库和会话", () => {
    const dir = setup();
    const file = join(dir, "data.db");
    const sessions = join(dir, "sessions");
    const backup = `${sessions}.backup`;
    const stage = `${sessions}.stage`;
    writeDb(file, "local");
    copyFileSync(file, `${file}.bak`);
    const name = writeChat(sessions, "local", "本地问题");
    renameSync(sessions, backup);
    mkdirSync(sessions);
    rmSync(file);
    writeDb(file, "remote");
    writeFileSync(
      `${file}.session-sync.json`,
      JSON.stringify({
        databaseBackup: `${file}.bak`,
        sessionDir: sessions,
        sessionsBackup: backup,
        hadSessions: true,
        stage,
      })
    );
    recoverSessionDownload(file);
    expect(markerOf(file)).toBe("local");
    expect(existsSync(join(sessions, name))).toBe(true);
    expect(existsSync(`${file}.session-sync.json`)).toBe(false);
  });
});

describe("页面键", () => {
  it("同一页面的锚点跳转算同一组对话；不同页面互不相干", () => {
    expect(normalizePageUrl("https://a.com/p?x=1#frag")).toBe("https://a.com/p?x=1");
    expect(browserPageKey("https://a.com/p#a")).toBe(browserPageKey("https://a.com/p#b"));
    expect(browserPageKey("https://a.com/p")).not.toBe(browserPageKey("https://a.com/q"));
  });

  it("URL 不进路径：目录名是哈希，带 ../ 的地址也只落在会话根下", () => {
    expect(browserSessionDirOf("https://a.com/../../etc/passwd")).not.toContain("..");
    expect(browserPageKey("https://a.com/x")).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("扩展对话（无索引表，事实源是会话文件）", () => {
  it("列表标题取 pi session name（没起名时取首条用户消息），消息数按用户提问数", async () => {
    const dir = join(setup(), "page");
    mkdirSync(dir, { recursive: true });
    writeChat(dir, "parent-1", "第一问");

    const before = await listSessionsInDir(dir);
    expect(before.find(item => item.id === "parent-1")?.title).toBe("第一问");
    expect(before.find(item => item.id === "parent-1")?.messageCount).toBe(1);
  });
});

describe("同步的会话目录", () => {
  it("只收 jsonl，完整目录校验后随数据库原子替换并保留备份", () => {
    const root = setup();
    const file = join(root, "data.db");
    const dir = join(root, "sessions");
    const stage = join(root, "stage");
    for (const [path, value] of [
      [file, "local"],
      [`${file}.download.tmp`, "remote"],
    ]) {
      const db = new Database(path);
      db.exec("CREATE TABLE marker(value TEXT)");
      db.prepare("INSERT INTO marker VALUES (?)").run(value);
      db.close();
    }
    const local = writeChat(dir, "local", "本地");
    writeFileSync(join(dir, "notes.txt"), "保留");
    const remote = writeChat(stage, "remote", "远端");
    expect([...validateSessionDirectory(stage).keys()]).toEqual([remote]);
    installSessionDownload(file, dir, stage);
    expect(readdirSync(dir)).toEqual([remote]);
    const backup = readdirSync(root).find(name => name.startsWith("sessions.pre-session-sync-"));
    expect(backup && readdirSync(join(root, backup)).sort()).toEqual([local, "notes.txt"].sort());
  });
  it("空目录有效，非法树和文件名不进入快照", () => {
    const root = setup();
    expect(validateSessionDirectory(root).size).toBe(0);
    writeFileSync(join(root, "bad.jsonl"), "{}\n");
    expect(() => validateSessionDirectory(root)).toThrow();
  });
});
