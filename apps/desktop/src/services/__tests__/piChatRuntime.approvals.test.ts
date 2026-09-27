import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ChatMessage, ResponseMessage } from "@/types";
import { piChatRuntime } from "../piChatRuntime";
import { receiveToolApprovals, useToolApprovalStore } from "../tool-permission/approvalStore";

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
  onPiToolApprovals: vi.fn(),
  piSessionApprovals: vi.fn().mockResolvedValue({ ok: true, snapshots: [] }),
  piSessionApproveTool: vi.fn(),
}));
vi.mock("../piChatSession", () => ({
  piChatSessionManager: { adoptOrResolveSession: mocks.adopt },
}));

const key = "main-chat:11";
const sessionId = "restored-session";
const waitingChat = (): ChatMessage =>
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
            },
          },
        ],
      },
    ],
  }) as ChatMessage;
const pending = () =>
  receiveToolApprovals({
    sessionId,
    revision: 1,
    pending: [
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
  });
const endTool = () =>
  mocks.listeners.get(sessionId)?.({
    type: "tool_execution_end",
    toolCallId: "call-1",
    toolName: "write",
    isError: false,
    result: { content: [{ type: "text", text: "落盘完成" }] },
  } as AgentSessionEvent);

describe("pi 审批恢复与后台归约", () => {
  beforeEach(() => {
    useToolApprovalStore.setState({ sessions: {}, readySessions: {} });
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
    pending();
    const restoring = piChatRuntime.restorePendingApprovals(key, "main-chat", 11);
    expect(useToolApprovalStore.getState().readySessions[sessionId]).not.toBe(true);
    resolveSession(sessionId);
    await restoring;
    expect(mocks.listeners.has(sessionId)).toBe(true);
    expect(useToolApprovalStore.getState().readySessions[sessionId]).toBe(true);
    expect(piChatRuntime.isStreaming(key)).toBe(true);
    receiveToolApprovals({ sessionId, revision: 2, pending: [] });
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

  it("没有 UI 钩子时仍持续归约审批，卸载视图不需要重建会话", () => {
    const container = piChatRuntime.ensureConversation(key, waitingChat(), {
      publish: vi.fn(),
      persist: async chat => chat,
    });
    piChatRuntime.bindSession(key, sessionId);
    pending();
    endTool();
    expect(
      (container.current.messages.at(-1) as ResponseMessage).assistant_blocks?.[0]
    ).toMatchObject({ execution: { status: "success" } });
    piChatRuntime.disposeConversation(key);
    expect(mocks.listeners.has(sessionId)).toBe(false);
    expect(useToolApprovalStore.getState().readySessions[sessionId]).toBe(false);
  });
});
