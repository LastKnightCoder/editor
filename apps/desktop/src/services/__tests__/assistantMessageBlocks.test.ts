import { afterEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/constants";
import type { AssistantReasoningBlock, RequestMessage } from "@/types";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantProviderMetadataSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  buildAssistantHistoryMessages,
  createAssistantMessage,
  finalizeAssistantTurn,
  getAssistantContentBlocks,
  sanitizeToolMessages,
} from "../assistantMessageBlocks";

const createTextMessage = (
  role: Role,
  text: string,
  extra?: Partial<RequestMessage>,
): RequestMessage => ({
  role,
  content: [{ type: "text", text }],
  ...extra,
});

const getReasoningBlock = (
  message: ReturnType<typeof createAssistantMessage>,
  turnId: string,
): AssistantReasoningBlock | undefined =>
  message.assistant_blocks?.find(
    (block): block is AssistantReasoningBlock =>
      block.turnId === turnId && block.type === "reasoning",
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("assistant reasoning timing", () => {
  it("在首个正文增量到达时立即结束 reasoning 计时", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const turnId = "turn-text";

    applyAssistantReasoningSnapshot(message, turnId, "先思考", 1000);

    vi.setSystemTime(2500);
    applyAssistantTextSnapshot(message, turnId, "开始回答");

    const reasoningBlock = getReasoningBlock(message, turnId);
    expect(reasoningBlock?.endTime).toBe(2500);
    expect(reasoningBlock?.duration).toBe(1500);

    vi.setSystemTime(4000);
    applyAssistantTextSnapshot(message, turnId, "开始回答，继续补充");

    expect(reasoningBlock?.endTime).toBe(2500);
    expect(reasoningBlock?.duration).toBe(1500);
    expect(message.content).toBe("开始回答，继续补充");
  });

  it("在首个工具调用增量到达时立即结束 reasoning 计时", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const turnId = "turn-tool";

    applyAssistantReasoningSnapshot(message, turnId, "先思考", 1000);

    vi.setSystemTime(1800);
    applyAssistantToolCallsSnapshot(
      message,
      turnId,
      [
        {
          toolCallId: "call-1",
          toolName: "search_docs",
          status: "pending",
          input: '{"q":"reasoning"}',
          timestamp: 1800,
        },
      ],
      [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"reasoning"}',
          },
        },
      ],
    );

    const reasoningBlock = getReasoningBlock(message, turnId);
    expect(reasoningBlock?.endTime).toBe(1800);
    expect(reasoningBlock?.duration).toBe(800);
  });

  it("只有 reasoning 时，在 turn finalize 阶段补齐结束时间", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const turnId = "turn-finalize";

    applyAssistantReasoningSnapshot(message, turnId, "先思考", 1000);

    vi.setSystemTime(1700);
    finalizeAssistantTurn(message, turnId);

    const reasoningBlock = getReasoningBlock(message, turnId);
    expect(reasoningBlock?.endTime).toBe(1700);
    expect(reasoningBlock?.duration).toBe(700);
  });

  it("已结束的 reasoning 不会被后续 text/tool 更新重复覆盖", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const turnId = "turn-stable";

    applyAssistantReasoningSnapshot(message, turnId, "先思考", 1000);

    vi.setSystemTime(2000);
    applyAssistantTextSnapshot(message, turnId, "第一次回答");

    const reasoningBlock = getReasoningBlock(message, turnId);
    expect(reasoningBlock?.endTime).toBe(2000);
    expect(reasoningBlock?.duration).toBe(1000);

    vi.setSystemTime(3500);
    applyAssistantToolCallsSnapshot(
      message,
      turnId,
      [
        {
          toolCallId: "call-2",
          toolName: "search_docs",
          status: "executing",
          input: '{"q":"followup"}',
          timestamp: 3500,
        },
      ],
      [
        {
          id: "call-2",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"followup"}',
          },
        },
      ],
    );

    expect(reasoningBlock?.endTime).toBe(2000);
    expect(reasoningBlock?.duration).toBe(1000);
  });

  it("工具调用后的新一轮 turn 应能重新创建 reasoning 并保持内容块顺序", () => {
    vi.useFakeTimers();
    const message = createAssistantMessage();
    const toolTurnId = "turn-tool-call";
    const answerTurnId = "turn-answer";

    applyAssistantReasoningSnapshot(message, toolTurnId, "先思考", 1000);

    vi.setSystemTime(1500);
    applyAssistantToolCallsSnapshot(
      message,
      toolTurnId,
      [
        {
          toolCallId: "call-1",
          toolName: "search_docs",
          status: "success",
          input: '{"q":"tesla"}',
          output: "搜索完成",
          timestamp: 1500,
        },
      ],
      [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"tesla"}',
          },
        },
      ],
    );
    finalizeAssistantTurn(message, toolTurnId);

    vi.setSystemTime(2200);
    applyAssistantReasoningSnapshot(message, answerTurnId, "再思考", 2200);

    vi.setSystemTime(2600);
    applyAssistantTextSnapshot(message, answerTurnId, "最终答案");
    finalizeAssistantTurn(message, answerTurnId);

    expect(message.reasoning_content).toBe("先思考\n\n再思考");
    expect(message.content).toBe("最终答案");
    expect(getAssistantContentBlocks(message)).toEqual([
      {
        type: "reasoning",
        content: "先思考",
        startTime: 1000,
        endTime: 1500,
        duration: 500,
      },
      {
        type: "tool_calls",
        executions: [
          {
            toolCallId: "call-1",
            toolName: "search_docs",
            status: "success",
            input: '{"q":"tesla"}',
            output: "搜索完成",
            timestamp: 1500,
          },
        ],
      },
      {
        type: "reasoning",
        content: "再思考",
        startTime: 2200,
        endTime: 2600,
        duration: 400,
      },
      {
        type: "text",
        content: "最终答案",
      },
    ]);
  });

  it("重建 assistant tool 历史时保留 reasoning_content", () => {
    const message = createAssistantMessage();
    const turnId = "turn-tool-history";

    applyAssistantReasoningSnapshot(message, turnId, "先分析参数", 1000);
    applyAssistantToolCallsSnapshot(
      message,
      turnId,
      [
        {
          toolCallId: "call-1",
          toolName: "search_docs",
          status: "success",
          input: '{"q":"kimi"}',
          output: "搜索完成",
          timestamp: 1200,
        },
      ],
      [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "search_docs",
            arguments: '{"q":"kimi"}',
          },
        },
      ],
    );
    finalizeAssistantTurn(message, turnId);

    expect(buildAssistantHistoryMessages(message)).toEqual([
      {
        role: Role.Assistant,
        content: "",
        reasoning_content: "先分析参数",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "search_docs",
              arguments: '{"q":"kimi"}',
            },
          },
        ],
      },
      {
        role: Role.Tool,
        content: [{ type: "text", text: "搜索完成" }],
        tool_call_id: "call-1",
        name: "search_docs",
      },
    ]);
  });

  it("重建普通 assistant 历史时保留 reasoning_content", () => {
    const message = createAssistantMessage();
    const turnId = "turn-answer-history";

    applyAssistantReasoningSnapshot(message, turnId, "先整理思路", 1000);
    applyAssistantTextSnapshot(message, turnId, "最终答案");
    finalizeAssistantTurn(message, turnId);

    expect(buildAssistantHistoryMessages(message)).toEqual([
      {
        role: Role.Assistant,
        content: [{ type: "text", text: "最终答案" }],
        reasoning_content: "先整理思路",
      },
    ]);
  });

  it("重建 Claude assistant 历史时保留供应商原始思考块", () => {
    const message = createAssistantMessage();
    const turnId = "turn-claude-thinking";
    const providerMetadata = {
      claude: {
        content: [
          {
            type: "thinking",
            thinking: "先分析",
            signature: "signed-thinking",
          },
          { type: "text", text: "最终答案" },
        ],
      },
    };

    applyAssistantReasoningSnapshot(message, turnId, "先分析", 1000);
    applyAssistantTextSnapshot(message, turnId, "最终答案");
    applyAssistantProviderMetadataSnapshot(message, turnId, providerMetadata);
    finalizeAssistantTurn(message, turnId);

    expect(buildAssistantHistoryMessages(message)).toEqual([
      {
        role: Role.Assistant,
        content: [{ type: "text", text: "最终答案" }],
        reasoning_content: "先分析",
        provider_metadata: providerMetadata,
      },
    ]);
  });

  it("读取内容块时不应修改冻结的 assistant message", () => {
    const message = Object.freeze({
      role: Role.Assistant,
      content: "最终答案",
      reasoning_content: "先整理思路",
      tool_calls: undefined,
      assistant_blocks: [
        {
          id: "turn-1:reasoning",
          turnId: "turn-1",
          type: "reasoning" as const,
          state: "final" as const,
          content: "先整理思路",
        },
        {
          id: "turn-1:text",
          turnId: "turn-1",
          type: "text" as const,
          state: "final" as const,
          content: "最终答案",
        },
      ],
    });

    expect(() => getAssistantContentBlocks(message as never)).not.toThrow();
    expect(buildAssistantHistoryMessages(message as never)).toEqual([
      {
        role: Role.Assistant,
        content: [{ type: "text", text: "最终答案" }],
        reasoning_content: "先整理思路",
      },
    ]);
  });
});

describe("sanitizeToolMessages", () => {
  const mkToolCall = (id: string, name: string): RequestMessage => ({
    role: Role.Assistant,
    content: "",
    tool_calls: [{ id, type: "function", function: { name, arguments: "{}" } }],
  });

  const mkToolResult = (
    id: string,
    name: string,
    text = "ok",
  ): RequestMessage => ({
    role: Role.Tool,
    content: [{ type: "text", text }],
    tool_call_id: id,
    name,
  });

  it("不含工具消息时原样返回", () => {
    const msgs: RequestMessage[] = [
      createTextMessage(Role.User, "hello"),
      createTextMessage(Role.Assistant, "hi"),
    ];
    expect(sanitizeToolMessages(msgs)).toEqual(msgs);
  });

  it("匹配的 tool_call/tool_result 对原样保留", () => {
    const msgs: RequestMessage[] = [
      createTextMessage(Role.User, "do it"),
      mkToolCall("c1", "search"),
      mkToolResult("c1", "search", "found it"),
      createTextMessage(Role.User, "thanks"),
    ];
    expect(sanitizeToolMessages(msgs)).toEqual(msgs);
  });

  it("缺少 tool_result 时合成占位消息", () => {
    const assistant: RequestMessage = {
      role: Role.Assistant,
      content: "",
      tool_calls: [
        {
          id: "c1",
          type: "function",
          function: { name: "a", arguments: "{}" },
        },
        {
          id: "c2",
          type: "function",
          function: { name: "b", arguments: "{}" },
        },
      ],
    };
    const msgs: RequestMessage[] = [
      createTextMessage(Role.User, "go"),
      assistant,
      mkToolResult("c1", "a", "done"),
    ];
    const result = sanitizeToolMessages(msgs);
    expect(result).toHaveLength(4);
    expect(result[3]).toEqual({
      role: Role.Tool,
      content: [{ type: "text", text: "[No output]" }],
      tool_call_id: "c2",
      name: "b",
    });
  });

  it("孤立的 tool_result（无前置 assistant tool_calls）被丢弃", () => {
    const msgs: RequestMessage[] = [
      createTextMessage(Role.User, "hello"),
      mkToolResult("orphan", "search", "stale result"),
      createTextMessage(Role.Assistant, "response"),
    ];
    const result = sanitizeToolMessages(msgs);
    expect(result).toEqual([
      createTextMessage(Role.User, "hello"),
      createTextMessage(Role.Assistant, "response"),
    ]);
  });

  it("tool_result 引用了错误的 tool_call_id 时被替换", () => {
    const msgs: RequestMessage[] = [
      mkToolCall("c1", "search"),
      mkToolResult("wrong-id", "search", "bad ref"),
    ];
    const result = sanitizeToolMessages(msgs);
    expect(result).toHaveLength(2);
    expect(result[1].tool_call_id).toBe("c1");
    expect(result[1].content).toEqual([{ type: "text", text: "[No output]" }]);
  });

  it("多组 assistant/tool 序列各自独立清洗", () => {
    const msgs: RequestMessage[] = [
      mkToolCall("c1", "a"),
      mkToolResult("c1", "a"),
      createTextMessage(Role.User, "next"),
      mkToolCall("c2", "b"),
      // missing tool_result for c2
    ];
    const result = sanitizeToolMessages(msgs);
    expect(result).toHaveLength(5);
    expect(result[4]).toEqual({
      role: Role.Tool,
      content: [{ type: "text", text: "[No output]" }],
      tool_call_id: "c2",
      name: "b",
    });
  });

  it("合成的 tool_result 按 tool_calls 顺序排列", () => {
    const assistant: RequestMessage = {
      role: Role.Assistant,
      content: "",
      tool_calls: [
        {
          id: "c1",
          type: "function",
          function: { name: "a", arguments: "{}" },
        },
        {
          id: "c2",
          type: "function",
          function: { name: "b", arguments: "{}" },
        },
        {
          id: "c3",
          type: "function",
          function: { name: "c", arguments: "{}" },
        },
      ],
    };
    const msgs: RequestMessage[] = [
      assistant,
      mkToolResult("c3", "c", "third"),
      mkToolResult("c1", "a", "first"),
    ];
    const result = sanitizeToolMessages(msgs);
    expect(result.map((m) => m.tool_call_id)).toEqual([
      undefined,
      "c1",
      "c2",
      "c3",
    ]);
  });
});
