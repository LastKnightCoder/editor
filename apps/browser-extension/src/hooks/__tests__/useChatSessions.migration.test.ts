import { describe, it, expect } from "vitest";
import { __chatSessionTestUtils } from "../useChatSessions";

describe("useChatSessions migration", () => {
  it("迁移会话元数据时保留历史并统一为本地代理", () => {
    const { normalizeSessionMeta, STORAGE_SCHEMA_VERSION } = __chatSessionTestUtils as any;

    expect(
      normalizeSessionMeta({
        id: "legacy",
        title: "旧会话",
        createTime: 1,
        updateTime: 2,
      }).agentType
    ).toBe("local");

    expect(
      normalizeSessionMeta({
        id: "codex",
        title: "Codex 会话",
        createTime: 1,
        updateTime: 2,
        agentType: "codex",
        agentSessionId: "thread-1",
      })
    ).toMatchObject({
      id: "codex",
      title: "Codex 会话",
      schemaVersion: STORAGE_SCHEMA_VERSION,
      agentType: "local",
      agentSessionId: null,
    });
  });

  it("支持 v1 消息数组迁移并保留 tool 角色上下文", () => {
    const rawV1Messages = [
      {
        id: "u-1",
        role: "user",
        content: "用户问题",
        timestamp: 1000,
      },
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
    ];

    const parsed = __chatSessionTestUtils.parseStoredMessages(rawV1Messages);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages[2].role).toBe("tool");
    expect(
      (
        parsed.messages[2] as {
          name?: string;
          tool_call_id?: string;
        }
      ).name
    ).toBe("ask-question");
    expect(
      (
        parsed.messages[2] as {
          name?: string;
          tool_call_id?: string;
        }
      ).tool_call_id
    ).toBe("call-1");
  });

  it("支持 v2 对象结构并处理未知角色回退", () => {
    const rawV2 = {
      schemaVersion: 2,
      messages: [
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
      ],
    };

    const parsed = __chatSessionTestUtils.parseStoredMessages(rawV2);

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].role).toBe("assistant");
    expect(parsed.messages[0].content).toBe("old format text");
    expect(
      (
        parsed.messages[0] as {
          requestContent?: Array<{ type: string }>;
        }
      ).requestContent?.length
    ).toBe(2);
  });
});
