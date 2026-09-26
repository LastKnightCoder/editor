import { describe, expect, it } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { assistantTextOf, createPiSessionReducer } from "../piSessionModel";

const ev = (event: unknown) => event as AgentSessionEvent;

const assistantMessage = (content: Array<Record<string, unknown>>, stopReason = "stop") => ({
  role: "assistant",
  content,
  api: "openai-completions",
  provider: "p",
  model: "m",
  usage: {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason,
  timestamp: 0,
});

describe("createPiSessionReducer", () => {
  it("message_update 快照语义：content 直接取 partial，幂等可重放", () => {
    const reducer = createPiSessionReducer();
    reducer.appendUserMessage("问题");
    reducer.process(ev({ type: "agent_start" }));
    reducer.process(ev({ type: "message_start", message: assistantMessage([]) }));
    reducer.process(
      ev({
        type: "message_update",
        message: assistantMessage([{ type: "thinking", thinking: "思考" }]),
        assistantMessageEvent: { type: "thinking_delta", delta: "思" },
      })
    );
    reducer.process(
      ev({
        type: "message_update",
        message: assistantMessage([
          { type: "thinking", thinking: "思考" },
          { type: "text", text: "部分" },
        ]),
        assistantMessageEvent: { type: "text_delta", delta: "部" },
      })
    );
    reducer.process(
      ev({
        type: "message_update",
        message: assistantMessage([
          { type: "thinking", thinking: "思考" },
          { type: "text", text: "部分回答" },
        ]),
        assistantMessageEvent: { type: "text_delta", delta: "分" },
      })
    );
    reducer.process(
      ev({
        type: "message_end",
        message: assistantMessage([
          { type: "thinking", thinking: "思考" },
          { type: "text", text: "部分回答" },
        ]),
      })
    );
    reducer.process(ev({ type: "agent_settled" }));

    expect(reducer.state.status).toBe("idle");
    expect(reducer.state.transcript).toHaveLength(2);
    const assistant = reducer.state.transcript[1];
    expect(assistant).toMatchObject({ kind: "assistant", streaming: false, stopReason: "stop" });
    expect(assistantTextOf(reducer.state)).toBe("部分回答");
    // 幂等：同一 update 事件重放不改变终态（content 取快照而非拼增量）
    reducer.process(
      ev({
        type: "message_update",
        message: assistantMessage([
          { type: "thinking", thinking: "思考" },
          { type: "text", text: "部分回答" },
        ]),
        assistantMessageEvent: { type: "text_delta", delta: "分" },
      })
    );
    expect(assistantTextOf(reducer.state)).toBe("部分回答");
  });

  it("工具三段事件与 turn_end 的 toolResult 各自成项", () => {
    const reducer = createPiSessionReducer();
    reducer.process(ev({ type: "agent_start" }));
    reducer.process(
      ev({
        type: "tool_execution_start",
        toolCallId: "c1",
        toolName: "bash",
        args: { command: "echo hi" },
      })
    );
    reducer.process(
      ev({
        type: "tool_execution_update",
        toolCallId: "c1",
        toolName: "bash",
        args: {},
        partialResult: { content: [{ type: "text", text: "部分输出" }] },
      })
    );
    reducer.process(
      ev({
        type: "tool_execution_end",
        toolCallId: "c1",
        toolName: "bash",
        result: { content: [{ type: "text", text: "hi" }] },
        isError: false,
      })
    );
    reducer.process(
      ev({
        type: "turn_end",
        message: assistantMessage([]),
        toolResults: [
          {
            role: "toolResult",
            toolCallId: "c1",
            toolName: "bash",
            content: [{ type: "text", text: "hi" }],
            isError: false,
            timestamp: 0,
          },
        ],
      })
    );

    expect(reducer.state.executions).toEqual([
      {
        toolCallId: "c1",
        toolName: "bash",
        argsPreview: '{"command":"echo hi"}',
        status: "done",
        outputPreview: "hi",
      },
    ]);
    const toolResult = reducer.state.transcript.find(item => item.kind === "toolResult");
    expect(toolResult).toMatchObject({
      kind: "toolResult",
      toolCallId: "c1",
      isError: false,
      contentText: "hi",
    });
  });

  it("auto_retry 与 queue_update 状态", () => {
    const reducer = createPiSessionReducer();
    reducer.process(ev({ type: "agent_start" }));
    reducer.process(
      ev({
        type: "auto_retry_start",
        attempt: 1,
        maxAttempts: 3,
        delayMs: 2000,
        errorMessage: "429",
      })
    );
    expect(reducer.state.retrying).toEqual({ attempt: 1, maxAttempts: 3 });
    reducer.process(ev({ type: "queue_update", steering: ["插个话"], followUp: [] }));
    expect(reducer.state.queuedInput.steering).toEqual(["插个话"]);
    reducer.process(ev({ type: "auto_retry_end", success: true, attempt: 1 }));
    reducer.process(ev({ type: "agent_settled" }));
    expect(reducer.state.retrying).toBeNull();
    expect(reducer.state.status).toBe("idle");
  });

  it("message_end 的 error stopReason 记入 lastError", () => {
    const reducer = createPiSessionReducer();
    reducer.process(ev({ type: "message_start", message: assistantMessage([]) }));
    reducer.process(
      ev({
        type: "message_end",
        message: { ...assistantMessage([], "error"), errorMessage: "网关 502" },
      })
    );
    expect(reducer.state.lastError).toBe("网关 502");
  });
});
