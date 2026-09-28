/**
 * 老对话一次性迁移（M4）：五张旧表 → pi 会话文件 + 目录表。
 * 覆盖：场景/所属对象/元数据映射、分支父子关系、展示 entry 让文件卡片原样重现、
 * 思考内容不迁、工具卡结果保留、只跑一次、单行损坏不拖垮整体、迁移后 pi 能 resume。
 */
import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyChatsToSessions } from "../chat-session-migration";
import { loadSessionTranscript } from "../pi-session-host-core";
import { piEntriesToDesktopMessages } from "../pi-session-transcript";
import ChatSessionTable from "../tables/chat-session";

let nativeAvailable = true;
try {
  const probe = new Database(":memory:");
  probe.close();
} catch {
  nativeAvailable = false;
}

const LEGACY_SCHEMA = `
  CREATE TABLE chat_message (
    id INTEGER PRIMARY KEY, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL, messages TEXT,
    title TEXT, group_id INTEGER, archived INTEGER DEFAULT 0, parent_chat_id INTEGER,
    branch_index INTEGER DEFAULT 0, order_num INTEGER, message_schema_version INTEGER DEFAULT 3,
    title_dirty INTEGER DEFAULT 0, agent_type TEXT DEFAULT 'local', agent_session_id TEXT,
    source TEXT DEFAULT 'desktop');
  CREATE TABLE pdf_chats (
    id INTEGER PRIMARY KEY, pdf_id INTEGER NOT NULL, create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL, messages TEXT, title TEXT, archived INTEGER DEFAULT 0,
    parent_chat_id INTEGER, branch_index INTEGER DEFAULT 0, message_schema_version INTEGER DEFAULT 3,
    agent_type TEXT DEFAULT 'local', agent_session_id TEXT);
  CREATE TABLE video_note_chats (
    id INTEGER PRIMARY KEY, video_note_id INTEGER NOT NULL, create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL, messages TEXT, title TEXT, archived INTEGER DEFAULT 0,
    parent_chat_id INTEGER, branch_index INTEGER DEFAULT 0, message_schema_version INTEGER DEFAULT 3,
    agent_type TEXT DEFAULT 'local', agent_session_id TEXT);
  CREATE TABLE vibe_learning_chats (
    id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL, messages TEXT, title TEXT, archived INTEGER DEFAULT 0,
    parent_chat_id INTEGER, branch_index INTEGER DEFAULT 0, message_schema_version INTEGER DEFAULT 3,
    agent_type TEXT DEFAULT 'local', agent_session_id TEXT);
`;

const toolAnswer = {
  role: "assistant",
  content: "查完了",
  assistant_blocks: [
    { id: "t1:reasoning", turnId: "t1", type: "reasoning", state: "final", content: "旧的思考" },
    { id: "t1:text", turnId: "t1", type: "text", state: "final", content: "先查一下" },
    {
      id: "call-1",
      turnId: "t1",
      type: "tool_call",
      state: "final",
      toolCall: { id: "call-1", function: { name: "search", arguments: '{"q":"x"}' } },
      execution: {
        toolCallId: "call-1",
        toolName: "search",
        status: "success",
        input: '{"q":"x"}',
        output: "结果",
        timestamp: 1,
      },
    },
    { id: "t2:text", turnId: "t2", type: "text", state: "final", content: "查完了" },
  ],
};

const fileMessage = {
  clientId: "u-file",
  role: "user",
  content: [
    { type: "text", text: "看看这个文件" },
    { type: "file", file: "D:/docs/报告.pdf", fileName: "报告.pdf" },
  ],
};

describe.skipIf(!nativeAvailable)("老对话迁移到 pi 会话", () => {
  it("整体中断后重试复用已迁移行的身份", async () => {
    db.exec(
      "DROP TABLE pdf_chats; CREATE TABLE pdf_chats(id INTEGER, create_time INTEGER, update_time INTEGER, messages TEXT)"
    );
    db.prepare(
      "INSERT INTO chat_message(id, create_time, update_time, messages) VALUES(1,1,1,?)"
    ).run(JSON.stringify([{ role: "user", content: "保留" }]));
    const options = { db, databasePath: ":memory:", sessionDir, cwd: workDir };
    await expect(migrateLegacyChatsToSessions(options)).rejects.toThrow();
    const before = ChatSessionTable.list(db);
    expect(before).toHaveLength(1);
    db.exec("ALTER TABLE pdf_chats ADD COLUMN pdf_id INTEGER");
    await migrateLegacyChatsToSessions(options);
    expect(ChatSessionTable.list(db).map(row => row.id)).toEqual(before.map(row => row.id));
  });
  let db: Database.Database;
  let workDir: string;
  let sessionDir: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(LEGACY_SCHEMA);
    workDir = mkdtempSync(join(tmpdir(), "chat-migrate-"));
    sessionDir = join(workDir, "sessions");
  });

  afterEach(() => {
    db.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  const insertMain = (id: number, messages: unknown[], extra: Record<string, unknown> = {}) =>
    db
      .prepare(
        `INSERT INTO chat_message (id, create_time, update_time, messages, title, group_id, archived,
           parent_chat_id, branch_index, order_num, title_dirty, source)
         VALUES (@id, @create, @update, @messages, @title, @group, @archived, @parent, @branch, @order, @dirty, @source)`
      )
      .run({
        id,
        create: 1000 + id,
        update: 2000 + id,
        messages: JSON.stringify(messages),
        title: `对话 ${id}`,
        group: null,
        archived: 0,
        parent: null,
        branch: 0,
        order: null,
        dirty: 1,
        source: "desktop",
        ...extra,
      });

  const migrate = () =>
    migrateLegacyChatsToSessions({ db, databasePath: ":memory:", sessionDir, cwd: workDir });

  it("每行一会话：场景、所属对象、标题/分组/置顶/归档/来源/时间原样搬进目录表", async () => {
    insertMain(
      1,
      [
        { role: "system", content: "sys" },
        { role: "user", content: "你好" },
      ],
      {
        group: 5,
        order: 2,
      }
    );
    db.prepare(
      "INSERT INTO pdf_chats (id, pdf_id, create_time, update_time, messages, title) VALUES (1, 42, 1, 2, ?, 'PDF 对话')"
    ).run(JSON.stringify([{ role: "user", content: "这页讲什么" }]));

    const result = await migrate();
    expect(result).toMatchObject({ skipped: false, migrated: 2, failed: [] });

    const main = ChatSessionTable.list(db, { scope: "main-chat" });
    expect(main).toHaveLength(1);
    expect(main[0]).toMatchObject({
      title: "对话 1",
      groupId: 5,
      orderNum: 2,
      source: "desktop",
      createTime: 1001,
      updateTime: 2001,
      messageCount: 1,
    });
    const pdf = ChatSessionTable.list(db, { scope: "pdf-chat", domainRef: "42" });
    expect(pdf.map(row => row.title)).toEqual(["PDF 对话"]);
    expect(readdirSync(sessionDir)).toHaveLength(2);
  });

  it("浏览器扩展的对话不迁：扩展对话与应用对话拆开，旧行原样留在旧表", async () => {
    insertMain(1, [{ role: "user", content: "桌面" }]);
    insertMain(2, [{ role: "user", content: "扩展" }], { source: "browser" });

    const result = await migrate();
    expect(result).toMatchObject({ migrated: 1, failed: [] });
    expect(ChatSessionTable.list(db, { includeArchived: true }).map(row => row.title)).toEqual([
      "对话 1",
    ]);
    expect(readdirSync(sessionDir)).toHaveLength(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM chat_message").get() as { n: number }).n).toBe(2);
  });

  it("分支行迁完当场并进父对话的会话树；第一条消息就对不上的留作独立对话", async () => {
    insertMain(1, [
      { role: "user", content: "主干" },
      { role: "assistant", content: "答" },
    ]);
    insertMain(
      2,
      [
        { role: "user", content: "主干" },
        { role: "assistant", content: "答" },
        { role: "user", content: "接着问" },
        { role: "assistant", content: "再答" },
      ],
      { parent: 1, branch: 3 }
    );
    insertMain(3, [{ role: "user", content: "另起炉灶" }], { parent: 1, branch: 4 });
    const result = await migrate();
    expect(result).toMatchObject({ migrated: 3, merged: 1, failed: [] });

    const rows = ChatSessionTable.list(db, { scope: "main-chat" });
    expect(rows.map(row => row.title).sort()).toEqual(["对话 1", "对话 3"]);
    expect(readdirSync(sessionDir)).toHaveLength(2);
  });

  it("很老的库缺后加的列（标题、分支等）：按空值迁移", async () => {
    const old = new Database(":memory:");
    try {
      old.exec(
        "CREATE TABLE chat_message (id INTEGER PRIMARY KEY, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL, messages TEXT)"
      );
      old
        .prepare("INSERT INTO chat_message VALUES (1, 1, 2, ?)")
        .run(JSON.stringify([{ role: "user", content: "早年的对话" }]));
      const result = await migrateLegacyChatsToSessions({
        db: old,
        databasePath: ":memory:",
        sessionDir,
        cwd: workDir,
      });
      expect(result).toMatchObject({ migrated: 1, failed: [] });
      expect(ChatSessionTable.list(old, { includeArchived: true })).toHaveLength(1);
    } finally {
      old.close();
    }
  });

  it("重开老对话：文件卡片原样显示，工具卡结果保留，思考内容不迁", async () => {
    insertMain(1, [{ role: "system", content: "sys" }, fileMessage, toolAnswer]);
    await migrate();
    const [row] = ChatSessionTable.list(db, { scope: "main-chat" });

    const messages = piEntriesToDesktopMessages(
      loadSessionTranscript(join(sessionDir, row.sessionFile), sessionDir)
    );
    expect(messages).toHaveLength(2);
    // 展示 entry：用户气泡是原来的文件卡片，不是「请用 read 工具读取」的模型提示
    expect(messages[0]).toMatchObject({ clientId: "u-file", content: fileMessage.content });
    const answer = messages[1] as {
      content: string;
      assistant_blocks: Array<{ type: string; execution?: { output?: string } }>;
    };
    expect(answer.assistant_blocks.some(block => block.type === "reasoning")).toBe(false);
    expect(
      answer.assistant_blocks.find(block => block.type === "tool_call")?.execution
    ).toMatchObject({ output: "结果" });
    expect(answer.content).toContain("查完了");
  });

  it("只跑一次：第二次直接跳过，不重复建会话", async () => {
    insertMain(1, [{ role: "user", content: "你好" }]);
    await migrate();
    const second = await migrate();
    expect(second.skipped).toBe(true);
    expect(ChatSessionTable.list(db, { scope: "main-chat" })).toHaveLength(1);
  });

  it("单行消息损坏不拖垮整体：记入失败清单，其余照常迁移", async () => {
    insertMain(1, [{ role: "user", content: "正常" }]);
    db.prepare(
      "INSERT INTO chat_message (id, create_time, update_time, messages, title) VALUES (2, 1, 1, '{坏的json', '坏行')"
    ).run();
    const result = await migrate();
    expect(result.migrated).toBe(1);
    expect(result.failed).toEqual([expect.objectContaining({ table: "chat_message", id: 2 })]);
  });

  it("旧表不存在（新装机）也能完成并记账", async () => {
    const fresh = new Database(":memory:");
    try {
      const result = await migrateLegacyChatsToSessions({
        db: fresh,
        databasePath: ":memory:",
        sessionDir,
        cwd: workDir,
      });
      expect(result).toMatchObject({ skipped: false, migrated: 0 });
      expect(
        (
          await migrateLegacyChatsToSessions({
            db: fresh,
            databasePath: ":memory:",
            sessionDir,
            cwd: workDir,
          })
        ).skipped
      ).toBe(true);
    } finally {
      fresh.close();
    }
  });
});
