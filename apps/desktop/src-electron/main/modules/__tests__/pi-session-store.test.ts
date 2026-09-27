/**
 * 会话存储层（M4）：扩展对话按目录列出/改名/删除（全部取自 pi 会话文件本身，无索引表），
 * 页面键的规范化与防路径穿越，以及同步用的会话目录打包/解包（含整体备份与失败回滚）。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteSessionInDir,
  listSessionsInDir,
  packSessionDir,
  renameSessionInDir,
  replaceSessionDir,
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

    renameSessionInDir(dir, "parent-1", "我的对话");
    const after = await listSessionsInDir(dir);
    expect(after.find(item => item.id === "parent-1")?.title).toBe("我的对话");
  });

  it("删除对话只删它自己的文件，其它对话不受影响", async () => {
    const dir = join(setup(), "page");
    mkdirSync(dir, { recursive: true });
    writeChat(dir, "parent-1", "第一问");
    writeChat(dir, "other-1", "无关对话");

    deleteSessionInDir(dir, "parent-1");
    expect((await listSessionsInDir(dir)).map(item => item.id)).toEqual(["other-1"]);
  });
});

describe("同步的会话目录打包", () => {
  it("打包只收 .jsonl；解包先整体备份再替换", () => {
    const root = setup();
    const sessionDir = join(root, "sessions", "data");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "1_a.jsonl"), '{"type":"session"}\n');
    writeFileSync(join(sessionDir, "notes.txt"), "忽略我");
    const archive = packSessionDir(sessionDir);

    // 本地换成另一份内容，再用远程包替换
    rmSync(join(sessionDir, "1_a.jsonl"));
    writeFileSync(join(sessionDir, "2_b.jsonl"), '{"type":"session"}\n');
    const { backupPath } = replaceSessionDir(sessionDir, archive, join(root, "backup"));

    // 解包后目录里只有远程包的内容；替换前的整个目录（含非 .jsonl 文件）在备份里
    expect(readdirSync(sessionDir)).toEqual(["1_a.jsonl"]);
    expect(backupPath && readdirSync(backupPath).sort()).toEqual(["2_b.jsonl", "notes.txt"]);
  });

  it("目录不存在时给空包（本机还没有对话）", () => {
    const root = setup();
    const target = join(root, "sessions");
    replaceSessionDir(target, packSessionDir(join(root, "missing")), join(root, "backup"));
    expect(readdirSync(target)).toEqual([]);
  });

  it("解包失败时把备份挪回来，本地不会落到半截目录", () => {
    const root = setup();
    const sessionDir = join(root, "sessions", "data");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "1_a.jsonl"), '{"type":"session"}\n');

    expect(() =>
      replaceSessionDir(sessionDir, Buffer.from("这不是 zip"), join(root, "backup"))
    ).toThrow();
    expect(existsSync(sessionDir)).toBe(true);
    expect(readdirSync(sessionDir)).toEqual(["1_a.jsonl"]);
  });
});
