import { afterEach, describe, expect, it, vi } from "vitest";

import { Role } from "@/constants";
import type { AssistantReasoningBlock, RequestMessage } from "@/types";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  createAssistantMessage,
  finalizeAssistantTurn,
  limitHistoryMessageGroups,
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

describe("limitHistoryMessageGroups", () => {
  it("按组截断历史，避免切断 assistant/tool 调用链", () => {
    const firstToolCall: RequestMessage = {
      role: Role.Assistant,
      content: "",
      tool_calls: [
        {
          id: "call-1",
          type: "function",
          function: {
            name: "moveToPosition",
            arguments: '{"x":28,"y":23}',
          },
        },
      ],
    };
    const firstToolResult = createTextMessage(Role.Tool, "Move to (28, 23)", {
      tool_call_id: "call-1",
      name: "moveToPosition",
    });
    const secondToolCall: RequestMessage = {
      role: Role.Assistant,
      content: "",
      tool_calls: [
        {
          id: "call-2",
          type: "function",
          function: {
            name: "moveToPosition",
            arguments: '{"x":36,"y":13}',
          },
        },
      ],
    };
    const secondToolResult = createTextMessage(Role.Tool, "Move to (36, 13)", {
      tool_call_id: "call-2",
      name: "moveToPosition",
    });

    const groups: RequestMessage[][] = [
      [createTextMessage(Role.User, "旧问题")],
      [firstToolCall, firstToolResult],
      [createTextMessage(Role.Assistant, "第一次移动完成")],
      [createTextMessage(Role.User, "新问题")],
      [secondToolCall, secondToolResult],
      [createTextMessage(Role.Assistant, "第二次移动完成")],
    ];

    const result = limitHistoryMessageGroups(groups, 5);

    expect(result).toEqual([
      createTextMessage(Role.Assistant, "第一次移动完成"),
      createTextMessage(Role.User, "新问题"),
      secondToolCall,
      secondToolResult,
      createTextMessage(Role.Assistant, "第二次移动完成"),
    ]);
  });

  it("即使单组超过限制，也保留完整工具调用组", () => {
    const toolCallMessage: RequestMessage = {
      role: Role.Assistant,
      content: "",
      tool_calls: [
        {
          id: "call-3",
          type: "function",
          function: {
            name: "getCurrentSpace",
            arguments: "{}",
          },
        },
      ],
    };
    const toolResultMessage = createTextMessage(
      Role.Tool,
      "TestMCP (space-1)",
      {
        tool_call_id: "call-3",
        name: "getCurrentSpace",
      },
    );

    const result = limitHistoryMessageGroups(
      [[toolCallMessage, toolResultMessage]],
      1,
    );

    expect(result).toEqual([toolCallMessage, toolResultMessage]);
  });
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
});
