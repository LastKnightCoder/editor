import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { __chatMigrationTestUtils } from "../../services/chatMigration";

const { normalizeStoredMessages, normalizeLegacySession, sortParentsFirst } =
  __chatMigrationTestUtils;

describe("chatMigration normalizeStoredMessages", () => {
  it("保留 tool 角色上下文（ask-question 恢复链路依赖）", () => {
    const messages = normalizeStoredMessages([
      { id: "u-1", role: "user", content: "用户问题", timestamp: 1000 },
      {
        id: "a-1",
        role: "assistant",
        content: "需要你进一步确认",
        timestamp: 1100,
        contentBlocks: [
          {
            type: "tool_calls",
            executions: [
              {
                toolCallId: "call-1",
                toolName: "ask-question",
                status: "pending",
                input: '{"questions":[{"question":"Q1","type":"single","options":["A"]}]}',
                timestamp: 1100,
              },
            ],
          },
        ],
      },
      {
        id: "t-1",
        role: "tool",
        content: '{"type":"ask-question-result"}',
        timestamp: 1200,
        name: "ask-question",
        tool_call_id: "call-1",
      },
    ]);

    expect(messages).toHaveLength(3);
    expect(messages[2].role).toBe("tool");
    expect((messages[2] as { name?: string }).name).toBe("ask-question");
    expect((messages[2] as { tool_call_id?: string }).tool_call_id).toBe("call-1");
  });

  it("未知角色回退 assistant，数组 content 提取文本并保留 requestContent", () => {
    const messages = normalizeStoredMessages([
      {
        id: "legacy-1",
        role: "unknown",
        content: [{ type: "text", text: "old format text" }],
        requestContent: [
          { type: "text", text: "old format text" },
          { type: "file", file: "/tmp/demo.pdf", fileName: "demo.pdf" },
        ],
        timestamp: 2000,
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
    expect(messages[0].content).toBe("old format text");
    expect(
      (messages[0] as { requestContent?: Array<{ type: string }> }).requestContent?.length
    ).toBe(2);
  });
});

describe("chatMigration sortParentsFirst", () => {
  it("父会话先于子分支导入（保证 parentChatId 映射可用）", () => {
    const sorted = sortParentsFirst([
      { id: "child", title: "分支", createTime: 2, updateTime: 2, parentChatId: "root" },
      {
        id: "grandchild",
        title: "子分支的分支",
        createTime: 3,
        updateTime: 3,
        parentChatId: "child",
      },
      { id: "root", title: "主对话", createTime: 1, updateTime: 1 },
    ]);

    expect(sorted.map(session => session.id)).toEqual(["root", "child", "grandchild"]);
  });

  it("parentChatId 成环的脏数据不触发无限递归", () => {
    const sorted = sortParentsFirst([
      { id: "a", title: "A", createTime: 1, updateTime: 1, parentChatId: "b" },
      { id: "b", title: "B", createTime: 2, updateTime: 2, parentChatId: "a" },
    ]);

    expect(sorted).toHaveLength(2);
  });
});

describe("chatMigration normalizeLegacySession", () => {
  it("丢弃 agentType 等废弃字段，保留快照与分支关系", () => {
    const session = normalizeLegacySession(
      {
        id: "s-1",
        title: "旧会话",
        createTime: 1,
        updateTime: 2,
        agentType: "codex",
        agentSessionId: "thread-1",
        schemaVersion: 2,
        systemPromptSnapshot: "PROMPT",
        parentChatId: "s-0",
        branchIndex: 2,
      },
      0
    );

    expect(session).toMatchObject({
      id: "s-1",
      title: "旧会话",
      systemPromptSnapshot: "PROMPT",
      parentChatId: "s-0",
      branchIndex: 2,
    });
    expect("agentType" in (session as object)).toBe(false);
  });
});

const { createdTitles, failOnCreateCall } = vi.hoisted(() => ({
  createdTitles: [] as string[],
  /** 第 N 次 createChat 调用抛错（0 = 不失败），用于模拟组内中途断连 */
  failOnCreateCall: { value: 0 },
}));

vi.mock("../../services/chatStoreClient", () => ({
  ensureGroupForUrl: vi.fn(async () => 7),
  createChat: vi.fn(async (options: { title: string }) => {
    if (createdTitles.length + 1 === failOnCreateCall.value) {
      failOnCreateCall.value = 0;
      throw new Error("桌面离线");
    }
    createdTitles.push(options.title);
    return {
      id: 100 + createdTitles.length,
      createTime: 1,
      updateTime: 1,
      messages: [],
      title: options.title,
    };
  }),
}));

describe("chatMigration runChatMigration 断点续传", () => {
  const storageData = new Map<string, unknown>();
  const chromeMock = {
    storage: {
      local: {
        get: vi.fn(async (key: string | null) => {
          if (key === null) {
            return Object.fromEntries(storageData);
          }
          const value = storageData.get(key);
          return value === undefined ? {} : { [key]: value };
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.entries(items).forEach(([k, v]) => storageData.set(k, v));
        }),
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createdTitles.length = 0;
    failOnCreateCall.value = 0;
    storageData.clear();
    (globalThis as { chrome?: unknown }).chrome = chromeMock;
    storageData.set("tau-chats-meta:https://a.example", [
      { id: "root", title: "主对话", createTime: 1, updateTime: 1 },
      { id: "child", title: "分支", createTime: 2, updateTime: 2, parentChatId: "root" },
    ]);
  });

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it("组内中断后重跑只补建缺失会话，不重复导入", async () => {
    const { runChatMigration } = await import("../../services/chatMigration");

    // 第一轮：root 成功、child 失败中断
    failOnCreateCall.value = 2;
    await runChatMigration();
    expect(createdTitles).toEqual(["主对话"]);

    // 第二轮：从中断处继续，只创建 child（parentChatId 映射来自持久化的 sessionIdMap）
    await runChatMigration();
    expect(createdTitles).toEqual(["主对话", "分支"]);

    const { createChat } = await import("../../services/chatStoreClient");
    expect(createChat).toHaveBeenCalledTimes(3);
    const secondRoundCall = vi.mocked(createChat).mock.calls[2]?.[0] as {
      parentChatId?: number | null;
    };
    expect(secondRoundCall.parentChatId).toBe(101);

    // 已完成的迁移不再重复执行
    await runChatMigration();
    expect(createdTitles).toEqual(["主对话", "分支"]);
  });
});
