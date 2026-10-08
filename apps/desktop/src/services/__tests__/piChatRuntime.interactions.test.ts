import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ChatMessage, ResponseMessage, ToolCallExecutionState } from "@/types";
import { piChatRuntime } from "../piChatRuntime";
import { receiveInteractions, usePiInteractionStore } from "../piInteractions";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: AgentSessionEvent) => void>(),
  adopt: vi.fn(),
  find: vi.fn(),
}));
vi.mock("@/constants", () => ({ Role: { Assistant: "assistant" } }));
vi.mock("@/commands/piSession", () => ({
  onPiSessionEvent: (id: string, listener: (event: AgentSessionEvent) => void) => {
    mocks.listeners.set(id, listener);
    return () => mocks.listeners.delete(id);
  },
  onPiSessionInteractions: vi.fn(),
  piSessionFindByScope: mocks.find,
  piSessionInteractions: vi.fn().mockResolvedValue({ ok: true, snapshots: [] }),
  piSessionApproveTool: vi.fn(),
  piSessionAnswerQuestion: vi.fn(),
}));
vi.mock("../piChatSession", () => ({
  piChatSessionManager: { adoptOrResolveSession: mocks.adopt },
}));

const chatId = "chat-11";
const key = `main-chat:${chatId}`;
const sessionId = "restored-session";
const waitingChat = (execution: Partial<ToolCallExecutionState> = {}): ChatMessage =>
  ({
    id: chatId,
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
    mocks.find.mockReset();
    mocks.find.mockResolvedValue({ ok: true, sessionId, busy: true });
  });
  afterEach(() => piChatRuntime.disposeConversation(key));

  it("恢复时先绑定事件再开放审批，完成后更新原工具行并落库", async () => {
    let resolveSession!: (session: { ok: boolean; sessionId: string; busy: boolean }) => void;
    mocks.adopt.mockReturnValue(
      new Promise(resolve => {
        resolveSession = resolve;
      })
    );
    const settle = vi.fn(async (chat: ChatMessage) => chat.messages);
    const container = piChatRuntime.ensureConversation(key, waitingChat(), {
      publish: vi.fn(),
      settle,
    });
    pendingApproval();
    const restoring = piChatRuntime.restoreSession(key, "main-chat", chatId);
    expect(piChatRuntime.isPending(key)).toBe(true);
    expect(usePiInteractionStore.getState().readySessions[sessionId]).not.toBe(true);
    resolveSession({ ok: true, sessionId, busy: true });
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
    expect(settle).toHaveBeenCalled();
    expect(piChatRuntime.isStreaming(key)).toBe(false);
  });

  // pi 无原生中止标志：中止落在工具执行中时收尾轮是 stopReason:"error" + AbortError
  it("用户停止后收尾轮的中止报错不展示，下一轮真错误照常展示", () => {
    const onStreamError = vi.fn();
    piChatRuntime.ensureConversation(key, waitingChat({ toolName: "ask-question" }), {
      publish: vi.fn(),
      settle: async chat => chat.messages,
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
    mocks.adopt.mockResolvedValue({ ok: true, sessionId, busy: true });
    const container = piChatRuntime.ensureConversation(
      key,
      waitingChat({ toolName: "ask-question", status: "executing" }),
      { publish: vi.fn(), settle: async chat => chat.messages }
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
    await piChatRuntime.restoreSession(key, "main-chat", chatId);
    expect(mocks.adopt).toHaveBeenCalledWith("main-chat", chatId, undefined);
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

  it("工具已完成也查询宿主；没有仍存活的宿主时允许正常发送", async () => {
    piChatRuntime.ensureConversation(key, waitingChat({ status: "success" }), {
      publish: vi.fn(),
      settle: async chat => chat.messages,
    });
    await piChatRuntime.restoreSession(key, "main-chat", chatId);
    expect(mocks.adopt).toHaveBeenCalled();
    expect(piChatRuntime.isStreaming(key)).toBe(false);
    expect(piChatRuntime.isPending(key)).toBe(false);
  });

  it("普通回答生成中刷新：恢复未落盘的快照、接收续流并在结束后解除运行态", async () => {
    const user = { role: "user", content: [{ type: "text", text: "解释正则表达式" }] };
    const partial = { role: "assistant", content: [{ type: "text", text: "正则表达式" }] };
    mocks.adopt.mockResolvedValue({
      ok: true,
      sessionId,
      busy: true,
      messages: [user],
      streamingMessage: partial,
    });
    const chat = { ...waitingChat(), messages: [user] } as ChatMessage;
    const final = { role: "assistant", content: "正则表达式用于匹配文本" };
    const settle = vi.fn(async () => [user, final] as ChatMessage["messages"]);
    const container = piChatRuntime.ensureConversation(key, chat, { publish: vi.fn(), settle });
    await piChatRuntime.restoreSession(key, "main-chat", chatId);

    expect(piChatRuntime.resolveSessionId(key)).toBe(sessionId);
    expect(piChatRuntime.isStreaming(key)).toBe(true);
    expect(container.current.messages.at(-1)?.role).toBe("assistant");
    mocks.listeners.get(sessionId)?.(
      assistantMessageEvent("message_end", {
        content: [{ type: "text", text: final.content }],
      })
    );
    expect(container.current.messages.at(-1)?.content).toBe(final.content);
    mocks.listeners.get(sessionId)?.({ type: "agent_settled" } as AgentSessionEvent);
    await Promise.resolve();
    expect(settle).toHaveBeenCalled();
    expect(piChatRuntime.isStreaming(key)).toBe(false);
    expect(container.current.messages).toHaveLength(2);
  });

  it("首字返回前刷新也恢复运行态，下一条回答正常写入", async () => {
    const user = { role: "user", content: [{ type: "text", text: "你好" }] };
    mocks.adopt.mockResolvedValue({ ok: true, sessionId, busy: true, messages: [user] });
    const container = piChatRuntime.ensureConversation(
      key,
      { ...waitingChat(), messages: [user] } as ChatMessage,
      { publish: vi.fn(), settle: async chat => chat.messages }
    );
    await piChatRuntime.restoreSession(key, "main-chat", chatId);
    expect(piChatRuntime.isStreaming(key)).toBe(true);
    mocks.listeners.get(sessionId)?.(assistantMessageEvent("message_start"));
    mocks.listeners.get(sessionId)?.(
      assistantMessageEvent("message_end", {
        content: [{ type: "text", text: "你好！" }],
      })
    );
    expect(container.current.messages.at(-1)?.content).toBe("你好！");
  });

  it("刷新期间已完成的回答按宿主投影补齐，保持空闲", async () => {
    const user = { role: "user", content: [{ type: "text", text: "你好" }] };
    const answer = { role: "assistant", content: "你好！" };
    mocks.adopt.mockResolvedValue({ ok: true, sessionId, busy: false, messages: [user, answer] });
    const container = piChatRuntime.ensureConversation(
      key,
      { ...waitingChat(), messages: [user] } as ChatMessage,
      { publish: vi.fn(), settle: async chat => chat.messages }
    );
    await piChatRuntime.restoreSession(key, "main-chat", chatId);
    expect(container.current.messages).toEqual([user, answer]);
    expect(piChatRuntime.isStreaming(key)).toBe(false);
  });

  it("宿主在查询后、续流订阅前结束，复核快照补齐回答并解除运行态", async () => {
    const user = { role: "user", content: [{ type: "text", text: "你好" }] };
    const answer = { role: "assistant", content: "你好！" };
    mocks.adopt.mockResolvedValue({ ok: true, sessionId, busy: true, messages: [user] });
    mocks.find.mockResolvedValue({ ok: true, sessionId, busy: false, messages: [user, answer] });
    const container = piChatRuntime.ensureConversation(
      key,
      { ...waitingChat(), messages: [user] } as ChatMessage,
      { publish: vi.fn(), settle: async chat => chat.messages }
    );
    await piChatRuntime.restoreSession(key, "main-chat", chatId);
    expect(container.current.messages).toMatchObject([user, answer]);
    expect(piChatRuntime.isStreaming(key)).toBe(false);
  });

  it("首条回答在查询后、订阅前开始，复核快照恢复当前 turn 并接上续流", async () => {
    const user = { role: "user", content: [{ type: "text", text: "你好" }] };
    mocks.adopt.mockResolvedValue({ ok: true, sessionId, busy: true, messages: [user] });
    mocks.find.mockResolvedValue({
      ok: true,
      sessionId,
      busy: true,
      messages: [user],
      streamingMessage: { role: "assistant", content: [{ type: "text", text: "你" }] },
    });
    const container = piChatRuntime.ensureConversation(
      key,
      { ...waitingChat(), messages: [user] } as ChatMessage,
      { publish: vi.fn(), settle: async chat => chat.messages }
    );
    await piChatRuntime.restoreSession(key, "main-chat", chatId);
    mocks.listeners.get(sessionId)?.(
      assistantMessageEvent("message_end", { content: [{ type: "text", text: "你好！" }] })
    );
    expect(container.current.messages.at(-1)?.content).toBe("你好！");
    expect(container.current.messages).toHaveLength(2);
  });

  it("复核期间已收到新一轮事件，迟到的空闲快照不能覆盖运行态", async () => {
    let resolveSnapshot!: (snapshot: Record<string, unknown>) => void;
    mocks.adopt.mockResolvedValue({ ok: true, sessionId, busy: true });
    mocks.find.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSnapshot = resolve;
        })
    );
    piChatRuntime.ensureConversation(key, waitingChat(), {
      publish: vi.fn(),
      settle: async chat => chat.messages,
    });
    const restoring = piChatRuntime.restoreSession(key, "main-chat", chatId);
    await vi.waitFor(() => expect(mocks.find).toHaveBeenCalled());
    mocks.listeners.get(sessionId)?.({ type: "agent_start" } as AgentSessionEvent);
    resolveSnapshot({ ok: true, sessionId, busy: false, messages: [] });
    await restoring;
    expect(piChatRuntime.isStreaming(key)).toBe(true);
  });

  it("没有 UI 钩子时仍持续归约审批，卸载视图不需要重建会话", () => {
    const container = piChatRuntime.ensureConversation(key, waitingChat(), {
      publish: vi.fn(),
      settle: async chat => chat.messages,
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
