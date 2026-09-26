import { describe, expect, it } from "vitest";
import { applyChatStreamEvent, type ChatStreamEvent } from "../streamEvents";
import { createAssistantMessage } from "../assistantBlocks";
import type { ToolCallExecutionState } from "../messages";

const execution = (overrides: Partial<ToolCallExecutionState> = {}): ToolCallExecutionState => ({
  toolCallId: "call-1",
  toolName: "get_page_content",
  status: "executing",
  input: "{}",
  timestamp: Date.now(),
  ...overrides,
});

describe("applyChatStreamEvent", () => {
  it("按快照语义组装同一 turn 的 reasoning 与 text 块", () => {
    const message = createAssistantMessage();
    applyChatStreamEvent(message, { type: "reasoning", turnId: "t1", fullText: "思考" });
    applyChatStreamEvent(message, { type: "reasoning", turnId: "t1", fullText: "思考继续" });
    applyChatStreamEvent(message, { type: "text", turnId: "t1", fullText: "回答" });

    expect(message.assistant_blocks).toHaveLength(2);
    expect(message.assistant_blocks?.[0]).toMatchObject({
      type: "reasoning",
      content: "思考继续",
      state: "streaming",
    });
    expect(message.assistant_blocks?.[1]).toMatchObject({
      type: "text",
      content: "回答",
      state: "streaming",
    });
    expect(message.content).toBe("回答");
    expect(message.reasoning_content).toBe("思考继续");
  });

  it("同一快照重放幂等（不重复建块、不重复拼接）", () => {
    const message = createAssistantMessage();
    const event: ChatStreamEvent = { type: "text", turnId: "t1", fullText: "回答" };
    applyChatStreamEvent(message, event);
    applyChatStreamEvent(message, event);

    expect(message.assistant_blocks).toHaveLength(1);
    expect(message.content).toBe("回答");
  });

  it("多轮工具循环按 turnId 隔离块，turn-finish 收敛对应轮", () => {
    const message = createAssistantMessage();
    applyChatStreamEvent(message, { type: "text", turnId: "t1", fullText: "先查一下" });
    applyChatStreamEvent(message, {
      type: "tool-calls",
      turnId: "t1",
      executions: [execution()],
    });
    applyChatStreamEvent(message, { type: "turn-finish", turnId: "t1" });
    applyChatStreamEvent(message, { type: "text", turnId: "t2", fullText: "根据结果回答" });
    applyChatStreamEvent(message, { type: "turn-finish", turnId: "t2" });

    expect(
      message.assistant_blocks?.map(block => `${block.turnId}:${block.type}:${block.state}`)
    ).toEqual(["t1:text:final", "t1:tool_call:final", "t2:text:final"]);
    expect(message.tool_calls?.map(call => call.id)).toEqual(["call-1"]);
  });

  it("tool-calls 快照带 toolCalls 时关联 execution 到既有工具块", () => {
    const message = createAssistantMessage();
    applyChatStreamEvent(message, {
      type: "tool-calls",
      turnId: "t1",
      toolCalls: [
        { id: "call-1", type: "function", function: { name: "get_page_content", arguments: "{}" } },
      ],
    });
    applyChatStreamEvent(message, {
      type: "tool-calls",
      turnId: "t1",
      executions: [execution({ status: "success", output: "页面内容" })],
    });

    expect(message.assistant_blocks).toHaveLength(1);
    expect(message.assistant_blocks?.[0]).toMatchObject({
      type: "tool_call",
      execution: { status: "success", output: "页面内容" },
    });
  });

  it("run-finish 与 usage 事件不改变块结构", () => {
    const message = createAssistantMessage();
    applyChatStreamEvent(message, { type: "text", turnId: "t1", fullText: "回答" });
    applyChatStreamEvent(message, {
      type: "usage",
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    });
    applyChatStreamEvent(message, { type: "run-finish", content: "回答" });

    expect(message.assistant_blocks).toHaveLength(1);
    expect(message.content).toBe("回答");
  });
});
