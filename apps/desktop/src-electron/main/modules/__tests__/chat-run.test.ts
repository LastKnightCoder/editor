import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ChatRunTable, { type ChatRunRecord } from "../tables/chat-run";
import { Role } from "@/constants";

let nativeAvailable = true;
try {
  const probe = new Database(":memory:");
  probe.close();
} catch {
  nativeAvailable = false;
}

describe.skipIf(!nativeAvailable)("ChatRunTable", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    ChatRunTable.upgradeTable(db);
  });

  afterEach(() => db.close());

  const createRecord = (runId: string, sessionKey: `main-chat:${number}`) =>
    ChatRunTable.create(db, {
      runId,
      sessionKey,
      source: "main-chat",
      chatId: Number(sessionKey.split(":")[1]),
      status: "running",
      requestPayload: [],
      userMessageClientId: `${runId}-user`,
      assistantMessageClientId: `${runId}-assistant`,
      attempt: 0,
      assistantSnapshot: "",
      reasoningSnapshot: "",
      toolSnapshot: [],
      errorMessage: null,
    }) as ChatRunRecord;

  it("按会话隔离活动任务并持久化快照", () => {
    const first = createRecord("run-1", "main-chat:1");
    createRecord("run-2", "main-chat:2");

    ChatRunTable.update(db, {
      ...first,
      assistantSnapshot: "第一会话",
      status: "completed",
    });

    const active = ChatRunTable.getActive(db);
    expect(active).toHaveLength(1);
    expect(active[0].sessionKey).toBe("main-chat:2");
    expect(ChatRunTable.get(db, "run-1")?.assistantSnapshot).toBe("第一会话");
  });

  it("旧代理等待输入的任务恢复为可重试状态，代理列保留原值不再改写", () => {
    createRecord("legacy-run", "main-chat:4");
    db.prepare(
      "UPDATE chat_run SET agent_type='codex',agent_session_id='old-thread',status='waiting_input' WHERE run_id=?"
    ).run("legacy-run");
    const recovered = ChatRunTable.get(db, "legacy-run")!;
    expect(recovered.status).toBe("interrupted");
    ChatRunTable.update(db, recovered);
    expect(
      db
        .prepare("SELECT agent_type,agent_session_id FROM chat_run WHERE run_id=?")
        .get("legacy-run")
    ).toEqual({ agent_type: "codex", agent_session_id: "old-thread" });
  });

  it("删除会话任务不会影响其他会话", () => {
    createRecord("run-1", "main-chat:1");
    createRecord("run-2", "main-chat:2");

    expect(ChatRunTable.deleteForSession(db, "main-chat:1")).toBe(1);
    expect(ChatRunTable.get(db, "run-1")).toBeNull();
    expect(ChatRunTable.get(db, "run-2")?.runId).toBe("run-2");
  });

  it("终态任务保留诊断元数据并清空恢复快照", () => {
    const run = createRecord("final-run", "main-chat:3");
    ChatRunTable.update(db, {
      ...run,
      requestPayload: [{ role: Role.User, content: "问题" }],
      assistantSnapshot: "回答",
      reasoningSnapshot: "推理",
      toolSnapshot: [{ output: "工具结果" }],
    });

    const finalized = ChatRunTable.finalize(db, "final-run", "completed");

    expect(finalized).toMatchObject({
      runId: "final-run",
      sessionKey: "main-chat:3",
      status: "completed",
      requestPayload: [],
      assistantSnapshot: "",
      reasoningSnapshot: "",
      toolSnapshot: [],
    });
  });

  it("仅压缩能够与已持久化消息可靠关联的历史终态任务", () => {
    db.exec("CREATE TABLE chat_message (id INTEGER PRIMARY KEY, messages TEXT)");
    const reconciled = createRecord("reconciled", "main-chat:4");
    const unresolved = createRecord("unresolved", "main-chat:5");
    const malformed = createRecord("malformed", "main-chat:6");
    ChatRunTable.update(db, {
      ...reconciled,
      assistantMessageClientId: "",
      status: "completed",
      requestPayload: [{ role: Role.User, content: "已保存的问题" }],
      assistantSnapshot: "已保存的回答",
    });
    ChatRunTable.update(db, {
      ...unresolved,
      status: "completed",
      requestPayload: [{ role: Role.User, content: "未确认的问题" }],
      assistantSnapshot: "未确认的回答",
    });
    ChatRunTable.update(db, {
      ...malformed,
      status: "completed",
      requestPayload: [{ role: Role.User, content: "损坏会话的问题" }],
      assistantSnapshot: "损坏会话的回答",
    });
    db.prepare("INSERT INTO chat_message (id,messages) VALUES (?,?)").run(
      4,
      JSON.stringify([
        { role: "user", clientId: "reconciled-user", content: "已保存的问题" },
        {
          role: "assistant",
          clientId: "reconciled-assistant",
          content: "已保存的回答",
        },
      ])
    );
    db.prepare("INSERT INTO chat_message (id,messages) VALUES (?,?)").run(
      5,
      JSON.stringify([{ role: "user", clientId: "unresolved-user", content: "未确认的问题" }])
    );
    db.prepare("INSERT INTO chat_message (id,messages) VALUES (?,?)").run(6, "not-json");

    expect(ChatRunTable.compactReconciledTerminalRuns(db)).toBe(1);
    expect(ChatRunTable.get(db, "reconciled")?.requestPayload).toEqual([]);
    expect(ChatRunTable.get(db, "unresolved")?.requestPayload).toHaveLength(1);
    expect(ChatRunTable.get(db, "malformed")?.requestPayload).toHaveLength(1);
  });

  it("按任务 ID 删除不会影响同一会话的新任务", () => {
    createRecord("stale-run", "main-chat:1");
    createRecord("current-run", "main-chat:1");

    expect(ChatRunTable.delete(db, "stale-run")).toBe(1);
    expect(ChatRunTable.get(db, "stale-run")).toBeNull();
    expect(ChatRunTable.get(db, "current-run")?.runId).toBe("current-run");
  });
});
