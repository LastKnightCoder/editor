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
    onQueueUpdate: vi.fn(),
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
    reducer.applyApprovals({
      sessionId: "s1",
      revision: 1,
      pending: [
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
    });
    expect(reducer.getExecutions()).toMatchObject([
      { status: "awaiting-approval", metadata: { piSessionId: "s1" } },
    ]);
    reducer.applyApprovals({ sessionId: "other-session", revision: 2, pending: [] });
    expect(reducer.getExecutions()[0].status).toBe("awaiting-approval");
    reducer.applyApprovals({ sessionId: "s1", revision: 2, pending: [] });
    expect(reducer.getExecutions()[0].status).toBe("executing");
    handle({
      type: "tool_execution_end",
      toolCallId: "call-1",
      toolName: "write",
      isError: false,
      result: { content: [{ type: "text", text: "完成" }], details: { written: true } },
    });
    reducer.applyApprovals({ sessionId: "s1", revision: 3, pending: [] });
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
