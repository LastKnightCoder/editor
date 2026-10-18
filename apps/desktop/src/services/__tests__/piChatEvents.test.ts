import { describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ResponseMessage } from "@/types";
import { PiChatEventReducer, type PiChatEventSink } from "../piChatEvents";

const setup = () => {
  const sink: PiChatEventSink = {
    applyText: vi.fn(),
    applyReasoning: vi.fn(),
    applyToolCalls: vi.fn(),
    finalizeTurn: vi.fn(),
    applyUsage: vi.fn(),
    onAssistantTurnEnd: vi.fn(),
    onRetryStatus: vi.fn(),
    onStreamError: vi.fn(),
    onSettled: vi.fn(),
    onUserMessageDelivered: vi.fn(),
  };
  const reducer = new PiChatEventReducer(sink, "s1");
  const handle = (event: unknown) => reducer.handle(event as AgentSessionEvent);
  const message = {
    role: "assistant",
    content: [{ type: "toolCall", id: "call-1", name: "write", arguments: { path: "test.md" } }],
  };
  return { sink, reducer, handle, message };
};

describe("pi 审批工具行归约", () => {
  it("缺少工具结束事件时，turn_end 保留展示 details 并发布最终工具行", () => {
    const { handle, reducer, message, sink } = setup();
    handle({ type: "message_start", message });
    handle({ type: "message_end", message });
    handle({ type: "tool_execution_start", toolCallId: "call-1", toolName: "write", args: {} });
    const details = { render: { rendererKey: "plugin-test", version: 1, payload: { count: 2 } } };
    handle({
      type: "turn_end",
      toolResults: [
        {
          toolCallId: "call-1",
          toolName: "write",
          content: [{ type: "text", text: "完成" }],
          details,
        },
      ],
    });
    expect(reducer.getExecutions()[0]).toMatchObject({ status: "success", metadata: details });
    expect(sink.applyToolCalls).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ status: "success", metadata: expect.objectContaining(details) }),
      ])
    );
  });
  it("流式完成时缓存读写并入上下文输入用量", () => {
    const { handle, sink } = setup();
    const message = {
      role: "assistant",
      content: [{ type: "text", text: "回答" }],
      usage: { input: 20, output: 30, cacheRead: 100, cacheWrite: 5 },
    };
    handle({ type: "message_start", message });
    handle({ type: "message_end", message });
    expect(sink.applyUsage).toHaveBeenCalledWith(
      {
        inputTokens: 125,
        outputTokens: 30,
        cacheReadTokens: 100,
        cacheWriteTokens: 5,
      },
      expect.any(String)
    );
  });
  it("只有终态消息时也生成工具行，审批快照与执行终态更新同一行", () => {
    const { reducer, handle, message, sink } = setup();
    handle({ type: "message_start", message });
    handle({ type: "message_end", message });
    handle({
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "write",
      args: { path: "test.md" },
    });
    reducer.applyInteractions({
      sessionId: "s1",
      revision: 1,
      approvals: [
        {
          sessionId: "s1",
          requestId: "r1",
          toolCallId: "call-1",
          toolName: "write",
          risk: "write",
          input: "{}",
          requestedAt: 1,
        },
      ],
      questions: [],
    });
    expect(reducer.getExecutions()).toMatchObject([
      { status: "awaiting-approval", metadata: { piSessionId: "s1" } },
    ]);
    reducer.applyInteractions({
      sessionId: "other-session",
      revision: 2,
      approvals: [],
      questions: [],
    });
    expect(reducer.getExecutions()[0].status).toBe("awaiting-approval");
    reducer.applyInteractions({ sessionId: "s1", revision: 2, approvals: [], questions: [] });
    expect(reducer.getExecutions()[0].status).toBe("executing");
    handle({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "write",
      isError: false,
      result: { content: [{ type: "text", text: "完成" }], details: { written: true } },
    });
    reducer.applyInteractions({ sessionId: "s1", revision: 3, approvals: [], questions: [] });
    expect(reducer.getExecutions()).toMatchObject([
      { status: "success", metadata: { piSessionId: "s1", written: true } },
    ]);
    expect(sink.applyToolCalls).toHaveBeenCalled();
  });

  it("重载恢复原 turn 工具卡，后续思考与正文不会复用旧 turn 标识", () => {
    const { reducer, handle, sink, message } = setup();
    reducer.restoreToolExecutions({
      assistant_blocks: [
        {
          id: "call-1",
          turnId: "pi:9999",
          type: "tool_call",
          state: "final",
          toolCall: { id: "call-1", function: { name: "write", arguments: "{}" } },
          execution: {
            toolCallId: "call-1",
            toolName: "write",
            status: "awaiting-approval",
            input: "{}",
            timestamp: 1,
          },
        },
      ],
    } as ResponseMessage);
    handle({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "write",
      isError: true,
      result: { content: [{ type: "text", text: "用户拒绝执行此工具" }] },
    });
    expect(sink.applyToolCalls).toHaveBeenLastCalledWith(
      "pi:9999",
      expect.arrayContaining([expect.objectContaining({ status: "failed" })])
    );
    handle({ type: "message_start", message });
    handle({
      type: "message_end",
      message: { ...message, content: [{ type: "text", text: "后续回答" }] },
    });
    expect(sink.applyText).toHaveBeenCalledWith("pi:10000", "后续回答");
  });
});

describe("运行中送达的用户消息（插话）", () => {
  const userMessage = (value: string) => ({
    role: "user",
    content: [{ type: "text", text: value }],
  });

  it("本轮发起消息不上报，其后的用户消息按插话上报", () => {
    const { handle, sink } = setup();
    handle({ type: "agent_start" });
    handle({ type: "message_start", message: userMessage("发起本轮的问题") });
    expect(sink.onUserMessageDelivered).not.toHaveBeenCalled();

    handle({ type: "message_start", message: userMessage("插一句") });
    expect(sink.onUserMessageDelivered).toHaveBeenCalledWith("插一句");
  });

  it("插话送达即清空工具执行映射，避免上一轮的工具事件写进新助手占位", () => {
    const { reducer, handle, sink, message } = setup();
    handle({ type: "agent_start" });
    handle({ type: "message_start", message: userMessage("发起本轮的问题") });
    handle({ type: "message_start", message });
    handle({ type: "message_end", message });
    expect(reducer.getExecutions()).toHaveLength(1);

    handle({ type: "message_start", message: userMessage("插一句") });
    expect(reducer.getExecutions()).toEqual([]);

    // 上一轮工具的迟到事件不再认领任何 turn，不会污染新的助手占位
    vi.mocked(sink.applyToolCalls).mockClear();
    handle({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "write",
      isError: false,
      result: { content: [{ type: "text", text: "迟到的结果" }] },
    });
    expect(sink.applyToolCalls).not.toHaveBeenCalled();
  });
});
