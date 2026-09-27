import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ChatMessage, ResponseMessage, ToolCallExecutionState } from "@/types";
import { piChatRuntime } from "../piChatRuntime";
import { receiveInteractions, usePiInteractionStore } from "../piInteractions";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: AgentSessionEvent) => void>(),
  adopt: vi.fn(),
}));
vi.mock("@/constants", () => ({ Role: { Assistant: "assistant" } }));
vi.mock("@/commands/piSession", () => ({
  onPiSessionEvent: (id: string, listener: (event: AgentSessionEvent) => void) => {
    mocks.listeners.set(id, listener);
    return () => mocks.listeners.delete(id);
  },
  onPiSessionInteractions: vi.fn(),
  piSessionInteractions: vi.fn().mockResolvedValue({ ok: true, snapshots: [] }),
  piSessionApproveTool: vi.fn(),
  piSessionAnswerQuestion: vi.fn(),
}));
vi.mock("../piChatSession", () => ({
  piChatSessionManager: { adoptOrResolveSession: mocks.adopt },
}));

const key = "main-chat:11";
const sessionId = "restored-session";
const waitingChat = (execution: Partial<ToolCallExecutionState> = {}): ChatMessage =>
  ({
    id: 11,
    title: "测试会话",
    createTime: 1,
    updateTime: 1,
    messages: [
      {
        role: "assistant",
        content: "",
        assistant_blocks: [
          {
            id: "call-1",
            turnId: "pi:20",
            type: "tool_call",
            state: "final",
            toolCall: { id: "call-1", function: { name: "write", arguments: "{}" } },
            execution: {
              toolCallId: "call-1",
              toolName: "write",
              input: "{}",
              status: "awaiting-approval",
              timestamp: 1,
              metadata: { piSessionId: sessionId },
              ...execution,
            },
          },
        ],
      },
    ],
  }) as ChatMessage;
const pendingApproval = () =>
  receiveInteractions({
    sessionId,
    revision: 1,
    approvals: [
      {
        requestId: "r1",
        sessionId,
        toolCallId: "call-1",
        toolName: "write",
        risk: "write",
        input: "{}",
        requestedAt: 1,
      },
    ],
    questions: [],
  });
const assistantMessageEvent = (
  type: "message_start" | "message_end",
  message: Record<string, unknown> = {}
) =>
  ({
    type,
    message: { role: "assistant", content: [], ...message },
  }) as unknown as AgentSessionEvent;
const endTool = (toolName = "write", text = "落盘完成") =>
  mocks.listeners.get(sessionId)?.({
    type: "tool_execution_end",
    toolCallId: "call-1",
    toolName,
    isError: false,
    result: { content: [{ type: "text", text }] },
  } as AgentSessionEvent);

describe("pi 待处理交互恢复与后台归约", () => {
  beforeEach(() => {
    usePiInteractionStore.setState({ sessions: {}, readySessions: {} });
    mocks.adopt.mockReset();
  });
  afterEach(() => piChatRuntime.disposeConversation(key));

  it("恢复时先绑定事件再开放审批，完成后更新原工具行并落库", async () => {
    let resolveSession!: (id: string) => void;
    mocks.adopt.mockReturnValue(
      new Promise<string>(resolve => {
        resolveSession = resolve;
      })
    );
    const persist = vi.fn(async (chat: ChatMessage) => chat);
    const container = piChatRuntime.ensureConversation(key, waitingChat(), {
      publish: vi.fn(),
      persist,
    });
    pendingApproval();
    const restoring = piChatRuntime.restorePendingInteractions(key, "main-chat", 11);
    expect(usePiInteractionStore.getState().readySessions[sessionId]).not.toBe(true);
    resolveSession(sessionId);
    await restoring;
    expect(mocks.listeners.has(sessionId)).toBe(true);
    expect(usePiInteractionStore.getState().readySessions[sessionId]).toBe(true);
    expect(piChatRuntime.isStreaming(key)).toBe(true);
    receiveInteractions({ sessionId, revision: 2, approvals: [], questions: [] });
    endTool();
    mocks.listeners.get(sessionId)?.({ type: "agent_settled" } as AgentSessionEvent);
    await Promise.resolve();
    const assistant = container.current.messages.at(-1) as ResponseMessage;
    expect(assistant.assistant_blocks).toHaveLength(1);
    expect(assistant.assistant_blocks?.[0]).toMatchObject({
      turnId: "pi:20",
      execution: { status: "success", output: "落盘完成" },
    });
    expect(persist).toHaveBeenCalled();
    expect(piChatRuntime.isStreaming(key)).toBe(false);
  });

  // pi 无原生中止标志：中止落在工具执行中时收尾轮是 stopReason:"error" + AbortError
  it("用户停止后收尾轮的中止报错不展示，下一轮真错误照常展示", () => {
    const onStreamError = vi.fn();
    piChatRuntime.ensureConversation(key, waitingChat({ toolName: "ask-question" }), {
      publish: vi.fn(),
      persist: async chat => chat,
      ui: { onStreamError },
    });
    piChatRuntime.bindSession(key, sessionId);
    const emit = (event: Partial<AgentSessionEvent>) =>
      mocks.listeners.get(sessionId)?.(event as AgentSessionEvent);

    emit({ type: "agent_start" });
    piChatRuntime.forceStopStreaming(key);
    expect(piChatRuntime.isStreaming(key)).toBe(false);
    emit(assistantMessageEvent("message_start"));
    emit(
      assistantMessageEvent("message_end", {
        stopReason: "error",
        errorMessage: "AbortError: The operation was aborted.",
      })
    );
    emit({ type: "agent_settled" });
    expect(onStreamError).not.toHaveBeenCalled();

    // 下一轮开始即复位：真实故障必须可见
    emit({ type: "agent_start" });
    emit(assistantMessageEvent("message_start"));
    emit(assistantMessageEvent("message_end", { stopReason: "error", errorMessage: "网关 500" }));
    expect(onStreamError).toHaveBeenCalledWith("网关 500");
  });

  it("等待中的提问同样触发恢复收养，宿主快照置运行态并续流写回原卡", async () => {
    mocks.adopt.mockResolvedValue(sessionId);
    const container = piChatRuntime.ensureConversation(
      key,
      waitingChat({ toolName: "ask-question", status: "executing" }),
      { publish: vi.fn(), persist: async chat => chat }
    );
    receiveInteractions({
      sessionId,
      revision: 1,
      approvals: [],
      questions: [
        {
          requestId: "q1",
          sessionId,
          toolCallId: "call-1",
          payload: { questions: [] },
          askedAt: 1,
        },
      ],
    });
    await piChatRuntime.restorePendingInteractions(key, "main-chat", 11);
    expect(mocks.adopt).toHaveBeenCalledWith("main-chat", 11);
    expect(piChatRuntime.isStreaming(key)).toBe(true);
    const execution = () =>
      (container.current.messages.at(-1) as ResponseMessage).assistant_blocks?.[0];
    expect(execution()).toMatchObject({ execution: { status: "executing" } });
    endTool("ask-question", '{"type":"ask-question-result"}');
    expect(execution()).toMatchObject({
      turnId: "pi:20",
      execution: { status: "success", output: '{"type":"ask-question-result"}' },
    });
  });

  it("没有等待用户的工具卡时不收养会话", async () => {
    piChatRuntime.ensureConversation(key, waitingChat({ status: "success" }), {
      publish: vi.fn(),
      persist: async chat => chat,
    });
    await piChatRuntime.restorePendingInteractions(key, "main-chat", 11);
    expect(mocks.adopt).not.toHaveBeenCalled();
  });

  it("没有 UI 钩子时仍持续归约审批，卸载视图不需要重建会话", () => {
    const container = piChatRuntime.ensureConversation(key, waitingChat(), {
      publish: vi.fn(),
      persist: async chat => chat,
    });
    piChatRuntime.bindSession(key, sessionId);
    pendingApproval();
    endTool();
    expect(
      (container.current.messages.at(-1) as ResponseMessage).assistant_blocks?.[0]
    ).toMatchObject({ execution: { status: "success" } });
    piChatRuntime.disposeConversation(key);
    expect(mocks.listeners.has(sessionId)).toBe(false);
    expect(usePiInteractionStore.getState().readySessions[sessionId]).toBe(false);
  });
});
