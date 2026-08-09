import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ChatRunTable from "../tables/chat-run";
import type { ChatRunRecord } from "@/types/chat-run";

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
      agentType: "local",
      status: "running",
      requestPayload: [],
      userMessageClientId: `${runId}-user`,
      assistantMessageClientId: `${runId}-assistant`,
      agentSessionId: null,
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

  it("删除会话任务不会影响其他会话", () => {
    createRecord("run-1", "main-chat:1");
    createRecord("run-2", "main-chat:2");

    expect(ChatRunTable.deleteForSession(db, "main-chat:1")).toBe(1);
    expect(ChatRunTable.get(db, "run-1")).toBeNull();
    expect(ChatRunTable.get(db, "run-2")?.runId).toBe("run-2");
  });

  it("按任务 ID 删除不会影响同一会话的新任务", () => {
    createRecord("stale-run", "main-chat:1");
    createRecord("current-run", "main-chat:1");

    expect(ChatRunTable.delete(db, "stale-run")).toBe(1);
    expect(ChatRunTable.get(db, "stale-run")).toBeNull();
    expect(ChatRunTable.get(db, "current-run")?.runId).toBe("current-run");
  });
});
