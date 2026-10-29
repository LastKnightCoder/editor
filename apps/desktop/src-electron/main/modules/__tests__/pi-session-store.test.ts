/**
 * 会话存储层（M4）：扩展对话按目录列出/改名/删除（全部取自 pi 会话文件本身，无索引表），
 * 页面键的规范化与防路径穿越，以及同步下载时库文件与会话目录的替换。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installDatabaseDownload, listSessionFiles, listSessionsInDir } from "../pi-session-store";
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
        display: {
          modelText: question,
          content: [{ type: "text", text: question }],
        },
      },
      { message: assistant("答", 2) },
    ],
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
  it("只收 jsonl，库文件与会话目录随下载整体替换", () => {
    const root = setup();
    const file = join(root, "data.db");
    const dir = join(root, "sessions");
    const stage = join(root, "stage");
    writeFileSync(file, "local");
    writeFileSync(`${file}-wal`, "wal");
    writeFileSync(`${file}.download.tmp`, "remote");
    writeChat(dir, "local", "本地");
    writeFileSync(join(dir, "notes.txt"), "不同步");
    const remote = writeChat(stage, "remote", "远端");
    expect(listSessionFiles(dir)).toHaveLength(1);
    installDatabaseDownload(file, `${file}.download.tmp`, dir, stage);
    expect(readFileSync(file, "utf8")).toBe("remote");
    expect(existsSync(`${file}-wal`)).toBe(false);
    expect(readdirSync(dir)).toEqual([remote]);
  });
  it("云端没有对话记录时保留本机会话目录", () => {
    const root = setup();
    const file = join(root, "data.db");
    const dir = join(root, "sessions");
    writeFileSync(file, "local");
    writeFileSync(`${file}.download.tmp`, "remote");
    const local = writeChat(dir, "local", "本地");
    installDatabaseDownload(file, `${file}.download.tmp`, dir);
    expect(readdirSync(dir)).toEqual([local]);
    expect(listSessionFiles(join(root, "missing"))).toEqual([]);
  });
  it("首次同步时自动创建缺失的会话父目录", () => {
    const root = setup();
    const file = join(root, "data.db");
    const dir = join(root, "sessions", "data");
    const stage = join(root, "stage");
    writeFileSync(file, "local");
    writeFileSync(`${file}.download.tmp`, "remote");
    writeChat(stage, "remote", "远端");

    installDatabaseDownload(file, `${file}.download.tmp`, dir, stage);

    expect(readdirSync(dir)).toHaveLength(1);
    expect(existsSync(join(root, "sessions"))).toBe(true);
  });
});
