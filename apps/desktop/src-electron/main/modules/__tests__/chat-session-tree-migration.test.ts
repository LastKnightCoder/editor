/**
 * 分支族合并成会话树（M4-d）：嫁接规则（按 id / 按内容认公共前缀）、合并后原对话不受影响、
 * 分支内容成为同一位置的另一个版本、对不上的降级成独立对话、只跑一次；
 * 以及老对话迁移（v1，分支一行一文件）→ 树合并（v2）的端到端路径。
 */
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { mergeChatSessionBranches } from "../chat-session-tree-migration";
import { migrateLegacyChatsToSessions } from "../chat-session-migration";
import { retireLegacyChats } from "../legacy-chat-retirement";
import { graftSessionFile } from "../pi-session-graft";
import { omitEntries, switchToVersion, writeSessionFile } from "../pi-session-files";
import { loadSessionTranscript } from "../pi-session-host-core";
import { piEntriesToDesktopMessages } from "../pi-session-transcript";
import { mergeBranchFilesInDir, listSessionsInDir } from "../pi-session-store";
import ChatSessionTable from "../tables/chat-session";
import type { RequestMessage } from "@/types";

let nativeAvailable = true;
try {
  new Database(":memory:").close();
} catch {
  nativeAvailable = false;
}

const assistant = (text: string, at: number) => ({
  role: "assistant" as const,
  content: [{ type: "text" as const, text }],
  api: "openai-completions" as const,
  provider: "legacy",
  model: "legacy",
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
const user = (text: string, at: number) => ({
  role: "user" as const,
  content: text,
  timestamp: at,
});
const turn = (question: string, answer: string, at: number) => [
  {
    message: user(question, at),
    display: { modelText: question, content: [{ type: "text" as const, text: question }] },
  },
  { message: assistant(answer, at + 1) },
];

/** 按内容写出的会话文件（entry id 随机：模拟迁移来的老分支） */
const writeChat = (sessionDir: string, sessionId: string, turns: Array<[string, string]>) =>
  writeSessionFile({
    sessionDir,
    sessionId,
    cwd: sessionDir,
    createdAt: 1,
    messages: turns.flatMap(([q, a], index) => turn(q, a, index * 10 + 1)),
  });

const projected = (file: string, sessionDir: string) =>
  piEntriesToDesktopMessages(loadSessionTranscript(file, sessionDir));
const texts = (file: string, sessionDir: string) =>
  projected(file, sessionDir).map(message =>
    typeof message.content === "string"
      ? message.content
      : (message.content as Array<{ text?: string }>).map(block => block.text ?? "").join("")
  );
const usersOf = (file: string, sessionDir: string) =>
  projected(file, sessionDir).filter(message => message.role === "user") as RequestMessage[];

let workDir: string;
let sessionDir: string;
beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "tree-migrate-"));
  sessionDir = join(workDir, "sessions");
});
afterEach(() => rmSync(workDir, { recursive: true, force: true }));

describe("嫁接分支文件", () => {
  it("只有删除差异的分支保留为独立会话，不能按空合并丢掉省略状态", () => {
    const parent = join(sessionDir, writeChat(sessionDir, "parent-omit", [["问题", "回答"]]));
    const branch = join(sessionDir, writeChat(sessionDir, "branch-omit", [["问题", "回答"]]));
    const manager = SessionManager.open(branch);
    omitEntries(manager, [manager.getEntries().find(entry => entry.type === "message")!.id]);
    const before = readFileSync(parent, "utf8");
    expect(graftSessionFile(parent, branch)).toEqual({ kind: "unrelated" });
    expect(readFileSync(parent, "utf8")).toBe(before);
    expect(usersOf(branch, sessionDir)).toEqual([]);
    expect(existsSync(branch)).toBe(true);
  });
  it("按内容认公共前缀：分叉后的内容成为同一位置的另一个版本，父对话当前路径不变", () => {
    const parent = join(
      sessionDir,
      writeChat(sessionDir, "p", [
        ["问一", "答一"],
        ["问二", "答二"],
      ])
    );
    const branch = join(
      sessionDir,
      writeChat(sessionDir, "b", [
        ["问一", "答一"],
        ["另一问", "另一答"],
      ])
    );

    expect(graftSessionFile(parent, branch)).toMatchObject({ kind: "merged", grafted: 3 });

    // 重开父对话仍在原路径上（嫁接后补了叶子标记指回原叶子）
    expect(texts(parent, sessionDir)).toEqual(["问一", "答一", "问二", "答二"]);
    const versions = usersOf(parent, sessionDir)[1].piVersions!;
    expect(versions.ids).toHaveLength(2);
    expect(versions.index).toBe(0);
    // 公共前缀没有重复写：第一问只有一个版本
    expect(usersOf(parent, sessionDir)[0].piVersions).toBeUndefined();

    switchToVersion(SessionManager.open(parent), versions.ids[1]);
    expect(texts(parent, sessionDir)).toEqual(["问一", "答一", "另一问", "另一答"]);
  });

  it("按 entry id 认公共前缀（M4 之后建的分支拷贝时保留了 id）", () => {
    const parentName = writeChat(sessionDir, "p", [
      ["问一", "答一"],
      ["问二", "答二"],
    ]);
    const parent = join(sessionDir, parentName);
    // 模拟 M4 的 branchSessionFile：前缀 entry 原样拷贝（id 不变），再接新内容
    const prefix = SessionManager.open(parent).getBranch().slice(0, 3);
    const branchFile = join(sessionDir, "branch.jsonl");
    const lines = [
      {
        type: "session",
        version: 3,
        id: "b",
        timestamp: new Date().toISOString(),
        cwd: sessionDir,
      },
      ...prefix,
    ];
    writeFileSync(branchFile, `${lines.map(line => JSON.stringify(line)).join("\n")}\n`);
    const opened = SessionManager.open(branchFile);
    opened.appendMessage(user("新方向", 50));
    opened.appendMessage(assistant("新回答", 51));

    expect(graftSessionFile(parent, branchFile).kind).toBe("merged");
    const versions = usersOf(parent, sessionDir)[1].piVersions!;
    expect(versions.ids).toHaveLength(2);
    switchToVersion(SessionManager.open(parent), versions.ids[1]);
    expect(texts(parent, sessionDir)).toEqual(["问一", "答一", "新方向", "新回答"]);
  });

  it("分支没有新内容（整条拷贝后没再聊）：空合并，父文件不写", () => {
    const parent = join(sessionDir, writeChat(sessionDir, "p", [["问一", "答一"]]));
    const branch = join(sessionDir, writeChat(sessionDir, "b", [["问一", "答一"]]));
    const before = SessionManager.open(parent).getEntries().length;
    expect(graftSessionFile(parent, branch)).toEqual({ kind: "merged", grafted: 0 });
    expect(SessionManager.open(parent).getEntries()).toHaveLength(before);
  });

  it("第一条消息就对不上：判为无关，父文件不动", () => {
    const parent = join(sessionDir, writeChat(sessionDir, "p", [["问一", "答一"]]));
    const branch = join(sessionDir, writeChat(sessionDir, "b", [["毫不相关", "答"]]));
    const before = SessionManager.open(parent).getEntries().length;
    expect(graftSessionFile(parent, branch)).toEqual({ kind: "unrelated" });
    expect(SessionManager.open(parent).getEntries()).toHaveLength(before);
  });

  it("分支在公共前缀上删过的消息，在嫁接出的版本里保持删除；父对话自己的路径不受影响", () => {
    const parent = join(
      sessionDir,
      writeChat(sessionDir, "p", [
        ["问一", "答一"],
        ["问二", "答二"],
      ])
    );
    const branch = join(
      sessionDir,
      writeChat(sessionDir, "b", [
        ["问一", "答一"],
        ["另一问", "另一答"],
      ])
    );
    const branchAnswer = projected(branch, sessionDir).find(m => m.role === "assistant")!;
    omitEntries(SessionManager.open(branch), branchAnswer.piEntryIds!);

    graftSessionFile(parent, branch);

    expect(texts(parent, sessionDir)).toEqual(["问一", "答一", "问二", "答二"]);
    switchToVersion(SessionManager.open(parent), usersOf(parent, sessionDir)[1].piVersions!.ids[1]);
    expect(texts(parent, sessionDir)).toEqual(["问一", "另一问", "另一答"]);
  });
});

describe.skipIf(!nativeAvailable)("目录表里的分支族合并", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    ChatSessionTable.upgradeTable(db);
    db.exec(
      "ALTER TABLE chat_session ADD COLUMN parent_session_id TEXT; ALTER TABLE chat_session ADD COLUMN branch_index INTEGER NOT NULL DEFAULT 0"
    );
  });
  afterEach(() => db.close());

  /** M4 时期的目录行：分支关系在 parent_session_id / branch_index 两列上（M8 起新表没有这两列） */
  const register = (id: string, file: string, parent: string | null = null, title = id) => {
    ChatSessionTable.create(db, { id, scope: "main-chat", sessionFile: file, title });
    db.prepare("UPDATE chat_session SET parent_session_id = ?, branch_index = ? WHERE id = ?").run(
      parent,
      parent ? 1 : 0,
      id
    );
  };
  const parentOf = (id: string) =>
    (
      db.prepare("SELECT parent_session_id AS p FROM chat_session WHERE id = ?").get(id) as {
        p: string | null;
      }
    ).p;
  const merge = () => mergeChatSessionBranches({ db, databasePath: ":memory:", sessionDir });

  it("子分支与孙分支都并进根文件：分支行与文件删掉，根对话多出版本；备份会话目录；只跑一次", () => {
    const root = writeChat(sessionDir, "root", [
      ["问一", "答一"],
      ["问二", "答二"],
    ]);
    const child = writeChat(sessionDir, "child", [
      ["问一", "答一"],
      ["子问", "子答"],
    ]);
    const grand = writeChat(sessionDir, "grand", [
      ["问一", "答一"],
      ["子问", "子答"],
      ["孙问", "孙答"],
    ]);
    register("root", root);
    register("child", child, "root");
    register("grand", grand, "child");

    const result = merge();
    expect(result).toMatchObject({ skipped: false, merged: 2, detached: 0, failed: [] });
    expect(result.backupPath && existsSync(result.backupPath)).toBeTruthy();
    expect(ChatSessionTable.list(db, { includeArchived: true }).map(row => row.id)).toEqual([
      "root",
    ]);
    expect(readdirSync(sessionDir)).toEqual([root]);

    const rootFile = join(sessionDir, root);
    expect(texts(rootFile, sessionDir)).toEqual(["问一", "答一", "问二", "答二"]);
    switchToVersion(
      SessionManager.open(rootFile),
      usersOf(rootFile, sessionDir)[1].piVersions!.ids[1]
    );
    // 子分支那个版本的最新位置在孙分支的末尾
    expect(texts(rootFile, sessionDir)).toEqual(["问一", "答一", "子问", "子答", "孙问", "孙答"]);

    expect(merge()).toMatchObject({ skipped: true });
  });

  it("对不上父文件的分支降级成独立对话（清掉父子关系），不丢数据", () => {
    const root = writeChat(sessionDir, "root", [["问一", "答一"]]);
    const stray = writeChat(sessionDir, "stray", [["另起炉灶", "答"]]);
    register("root", root);
    register("stray", stray, "root");

    expect(merge()).toMatchObject({ merged: 0, detached: 1 });
    const rows = ChatSessionTable.list(db, { includeArchived: true });
    expect(rows.map(row => row.id).sort()).toEqual(["root", "stray"]);
    expect(rows.every(row => parentOf(row.id) === null)).toBe(true);
    expect(readdirSync(sessionDir).sort()).toEqual([root, stray].sort());
  });

  it("没落盘的分支（首轮没等到回答）：行删掉；没有分支时不备份", () => {
    const root = writeChat(sessionDir, "root", [["问一", "答一"]]);
    register("root", root);
    register("ghost", "missing.jsonl", "root");
    expect(merge()).toMatchObject({ merged: 1 });
    expect(ChatSessionTable.list(db, { includeArchived: true }).map(row => row.id)).toEqual([
      "root",
    ]);

    const fresh = new Database(":memory:");
    ChatSessionTable.upgradeTable(fresh);
    expect(
      mergeChatSessionBranches({ db: fresh, databasePath: ":memory:", sessionDir }).backupPath
    ).toBeUndefined();
    fresh.close();
  });

  it("端到端：老数据的分支族（一行一分支、entry id 随机）→ 老对话迁移当场并成树 → 树合并只记账 → 旧表退役", async () => {
    const fresh = new Database(":memory:");
    ChatSessionTable.upgradeTable(fresh);
    const previous = db;
    db = fresh;
    previous.close();
    db.exec(`CREATE TABLE chat_message (
      id INTEGER PRIMARY KEY, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL, messages TEXT,
      title TEXT, group_id INTEGER, archived INTEGER DEFAULT 0, parent_chat_id INTEGER,
      branch_index INTEGER DEFAULT 0, order_num INTEGER, title_dirty INTEGER DEFAULT 0,
      source TEXT DEFAULT 'desktop')`);
    const insert = db.prepare(
      "INSERT INTO chat_message (id, create_time, update_time, messages, title, parent_chat_id, branch_index) VALUES (?, 1, 2, ?, ?, ?, ?)"
    );
    const q = (text: string) => ({ role: "user", content: text });
    const a = (text: string) => ({ role: "assistant", content: text });
    insert.run(1, JSON.stringify([q("问一"), a("答一"), q("问二"), a("答二")]), "主干", null, 0);
    insert.run(
      2,
      JSON.stringify([q("问一"), a("答一"), q("分支问"), a("分支答")]),
      "主干 - 分支 1",
      1,
      1
    );

    // 旧表退役要等两次迁移都记账：迁移前不动
    expect(retireLegacyChats(db, ":memory:")).toMatchObject({ retired: false });

    const migrated = await migrateLegacyChatsToSessions({
      db,
      databasePath: ":memory:",
      sessionDir,
      cwd: workDir,
    });
    expect(migrated).toMatchObject({ migrated: 2, merged: 1, failed: [] });
    expect(merge()).toMatchObject({ skipped: false, merged: 0, detached: 0 });

    const [row, ...others] = ChatSessionTable.list(db, { includeArchived: true });
    expect(others).toEqual([]);
    expect(row.title).toBe("主干");
    expect(readdirSync(sessionDir)).toEqual([row.sessionFile]);
    const file = join(sessionDir, row.sessionFile);
    const versions = usersOf(file, sessionDir)[1].piVersions!;
    expect(versions.ids).toHaveLength(2);
    switchToVersion(SessionManager.open(file), versions.ids[1]);
    expect(texts(file, sessionDir)).toEqual(["问一", "答一", "分支问", "分支答"]);

    expect(retireLegacyChats(db, ":memory:")).toMatchObject({
      retired: true,
      droppedTables: ["chat_message"],
      droppedBranchColumns: false,
    });
    expect(
      db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chat_message'").get()
    ).toBeUndefined();
    expect(retireLegacyChats(db, ":memory:")).toMatchObject({ retired: false });
  });

  it("M4 时期的库：树合并后旧表与分支列一起退役，目录行与会话文件保留，删前备份整库", () => {
    const dir = mkdtempSync(join(tmpdir(), "legacy-chat-retire-"));
    const dbPath = join(dir, "main.db");
    const disk = new Database(dbPath);
    try {
      ChatSessionTable.upgradeTable(disk);
      disk.exec(`ALTER TABLE chat_session ADD COLUMN parent_session_id TEXT;
        ALTER TABLE chat_session ADD COLUMN branch_index INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX idx_chat_session_parent ON chat_session(parent_session_id);
        CREATE TABLE pdf_chats (id INTEGER PRIMARY KEY, pdf_id INTEGER, messages TEXT);
        CREATE INDEX idx_pdf_chat_pdf_id ON pdf_chats(pdf_id);
        CREATE TABLE audio_note_chats (id INTEGER PRIMARY KEY, messages TEXT);
        INSERT INTO audio_note_chats VALUES (1, '[]');
        CREATE TABLE migration_meta (key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO migration_meta VALUES ('chat-session-pi-jsonl:v1', '{}');`);
      const root = writeChat(sessionDir, "root", [["问一", "答一"]]);
      ChatSessionTable.create(disk, { id: "root", scope: "main-chat", sessionFile: root });
      // 树合并还没跑：不退役（分支列还要读）
      expect(retireLegacyChats(disk, dbPath)).toMatchObject({ retired: false });
      mergeChatSessionBranches({ db: disk, databasePath: dbPath, sessionDir });

      const result = retireLegacyChats(disk, dbPath);
      expect(result).toMatchObject({
        retired: true,
        droppedTables: ["pdf_chats", "audio_note_chats"],
        droppedBranchColumns: true,
      });
      expect(result.backupPath && existsSync(result.backupPath)).toBeTruthy();
      const columns = (
        disk.prepare("PRAGMA table_info(chat_session)").all() as Array<{ name: string }>
      ).map(column => column.name);
      expect(columns).not.toContain("parent_session_id");
      expect(columns).not.toContain("branch_index");
      expect(ChatSessionTable.getById(disk, "root")).toMatchObject({ sessionFile: root });
      expect(existsSync(join(sessionDir, root))).toBe(true);
      // 丢弃的 audio_note_chats 只在备份里（用户裁决）
      const backup = new Database(result.backupPath!, { readonly: true });
      expect(backup.prepare("SELECT COUNT(*) AS n FROM audio_note_chats").get()).toEqual({ n: 1 });
      backup.close();
    } finally {
      disk.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("浏览器扩展页面目录", () => {
  it("列表时把 M4 的分支文件（会话头 parentSession）并进父文件，对不上的去掉父关系", async () => {
    const root = join(
      sessionDir,
      writeChat(sessionDir, "root", [
        ["问一", "答一"],
        ["问二", "答二"],
      ])
    );
    const branchName = writeChat(sessionDir, "branch", [
      ["问一", "答一"],
      ["另一问", "另一答"],
    ]);
    const strayName = writeChat(sessionDir, "stray", [["无关", "答"]]);
    const withParent = (name: string) => {
      const file = join(sessionDir, name);
      const [head, ...rest] = readFileSync(file, "utf8").split("\n");
      writeFileSync(
        file,
        [JSON.stringify({ ...JSON.parse(head), parentSession: root }), ...rest].join("\n")
      );
    };
    withParent(branchName);
    withParent(strayName);

    await mergeBranchFilesInDir(sessionDir);

    expect(readdirSync(sessionDir).sort()).toEqual([root.split(/[\\/]/).pop(), strayName].sort());
    expect(usersOf(root, sessionDir)[1].piVersions!.ids).toHaveLength(2);
    const sessions = await listSessionsInDir(sessionDir);
    expect(sessions.map(session => session.id).sort()).toEqual(["root", "stray"]);
    expect(sessions.find(session => session.id === "root")!.messageCount).toBe(2);
  });
});
