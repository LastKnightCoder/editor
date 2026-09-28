/**
 * 待发送队列与运行中插话的运行时归属（M3 第 5 项）：
 * 队列/插话都在模块级 runtime（组件卸载不丢）；插话送达时聊天行追加用户消息与助手占位；
 * 没送达的在 agent_settled 退回队首；用户按停止只暂停队列，不丢消息。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "@/types";
import type { MessageContentItem } from "@tau/shared";
import { piChatRuntime, type PiChatRuntimeDeps } from "../piChatRuntime";
import { usePiInteractionStore } from "../piInteractions";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: AgentSessionEvent) => void>(),
}));
vi.mock("@/constants", () => ({ Role: { Assistant: "assistant", User: "user" } }));
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

const key = "main-chat:chat-31";
const sessionId = "steer-session";
const text = (value: string): MessageContentItem[] => [{ type: "text", text: value }];
const baseChat = (): ChatMessage =>
  ({
    id: "chat-31",
    title: "新对话",
    titleDirty: true,
    createTime: 1,
    updateTime: 1,
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: [{ type: "text", text: "原始问题" }] },
      { role: "assistant", content: "" },
    ],
  }) as unknown as ChatMessage;

const emit = (event: unknown) => mocks.listeners.get(sessionId)?.(event as AgentSessionEvent);
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const setup = () => {
  const deps: PiChatRuntimeDeps = {
    publish: vi.fn(),
    settle: vi.fn(async (chat: ChatMessage) => chat.messages),
  };
  const container = piChatRuntime.ensureConversation(key, baseChat(), deps);
  piChatRuntime.bindSession(key, sessionId);
  return { container, deps };
};

describe("待发送队列归属运行时", () => {
  beforeEach(() => usePiInteractionStore.setState({ sessions: {}, readySessions: {} }));
  afterEach(() => piChatRuntime.disposeConversation(key));

  it("入队、编辑取出、删除都在运行时里，组件重挂载后仍在", () => {
    setup();
    piChatRuntime.enqueueMessage(key, text("第一条"));
    piChatRuntime.enqueueMessage(key, text("第二条"));
    expect(piChatRuntime.listQueue(key)).toEqual([text("第一条"), text("第二条")]);

    // 组件重挂载：ensureConversation 只刷新 deps，队列不受影响
    piChatRuntime.ensureConversation(key, baseChat(), {
      publish: vi.fn(),
      settle: vi.fn(async () => null),
    });
    expect(piChatRuntime.queueSize(key)).toBe(2);

    expect(piChatRuntime.takeQueuedMessage(key, 0)).toEqual(text("第一条"));
    piChatRuntime.removeQueuedMessage(key, 0);
    expect(piChatRuntime.listQueue(key)).toEqual([]);
  });

  it("停止只暂停队列：暂停期间不交出消息，手动发送后恢复", () => {
    setup();
    emit({ type: "agent_start" });
    piChatRuntime.enqueueMessage(key, text("排队的"));

    piChatRuntime.forceStopStreaming(key);
    expect(piChatRuntime.isQueuePaused(key)).toBe(true);
    expect(piChatRuntime.isStreaming(key)).toBe(false);
    expect(piChatRuntime.dequeueMessage(key)).toBeUndefined();
    expect(piChatRuntime.queueSize(key)).toBe(1);

    piChatRuntime.resumeQueue(key);
    expect(piChatRuntime.dequeueMessage(key)).toEqual(text("排队的"));
  });
});

describe("运行中插话", () => {
  beforeEach(() => usePiInteractionStore.setState({ sessions: {}, readySessions: {} }));
  afterEach(() => piChatRuntime.disposeConversation(key));

  it("运行中才能插话，停止后不能", () => {
    setup();
    expect(piChatRuntime.canSteer(key)).toBe(false);
    emit({ type: "agent_start" });
    expect(piChatRuntime.canSteer(key)).toBe(true);
    piChatRuntime.forceStopStreaming(key);
    expect(piChatRuntime.canSteer(key)).toBe(false);
  });

  it("送达时聊天行追加用户消息与新助手占位，本轮发起消息不重复追加", async () => {
    const { container } = setup();
    emit({ type: "agent_start" });
    // 本轮的发起消息（发送方已乐观写入聊天行）：不得再追加一条
    emit({ type: "message_start", message: { role: "user", content: text("原始问题") } });
    expect(container.current.messages).toHaveLength(3);

    const steerId = piChatRuntime.addPendingSteer(key, {
      text: "插一句",
      content: text("插一句"),
    });
    expect(steerId).toBeTruthy();
    expect(piChatRuntime.listPendingSteers(key)).toMatchObject([{ text: "插一句" }]);

    emit({ type: "message_start", message: { role: "user", content: text("插一句") } });
    await flush();

    expect(container.current.messages).toHaveLength(5);
    expect(container.current.messages[3]).toMatchObject({
      role: "user",
      content: text("插一句"),
    });
    expect(container.current.messages[4]).toMatchObject({ role: "assistant" });
    // 这条用户消息由 pi 在送达时写进 JSONL（展示 entry 由主进程紧跟着写），runtime 不另外落库
    expect(piChatRuntime.listPendingSteers(key)).toEqual([]);
    expect(piChatRuntime.queueSize(key)).toBe(0);
  });

  it("没送达的插话在本轮结束时退回队首，顺序不变", () => {
    setup();
    emit({ type: "agent_start" });
    piChatRuntime.enqueueMessage(key, text("本来就排着的"));
    piChatRuntime.addPendingSteer(key, { text: "插话一", content: text("插话一") });
    piChatRuntime.addPendingSteer(key, { text: "插话二", content: text("插话二") });

    emit({ type: "agent_settled" });

    expect(piChatRuntime.listPendingSteers(key)).toEqual([]);
    expect(piChatRuntime.listQueue(key)).toEqual([
      text("插话一"),
      text("插话二"),
      text("本来就排着的"),
    ]);
  });

  it("交不出去的插话退回队列且只退一次（settled 兜底与调用方失败处理不重复入队）", () => {
    setup();
    emit({ type: "agent_start" });
    const steerId = piChatRuntime.addPendingSteer(key, {
      text: "交不出去",
      content: text("交不出去"),
    });

    expect(piChatRuntime.returnPendingSteerToQueue(key, steerId ?? "")).toBe(true);
    expect(piChatRuntime.listQueue(key)).toEqual([text("交不出去")]);
    // 再退一次（settled 兜底已经退过的情形）不应重复入队
    expect(piChatRuntime.returnPendingSteerToQueue(key, steerId ?? "")).toBe(false);
    expect(piChatRuntime.queueSize(key)).toBe(1);
  });

  it("重载收养会话后收到的用户消息按插话处理（发起消息在重载前已过去）", async () => {
    const { container } = setup();
    // 没有 agent_start：收养的是进行中的会话
    emit({ type: "message_start", message: { role: "user", content: text("重载后送达") } });
    await flush();
    expect(container.current.messages).toHaveLength(5);
    expect(container.current.messages[3]).toMatchObject({ role: "user" });
  });
});
