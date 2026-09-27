import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ChatMessage } from "@/types";
import { piChatRuntime, type PiChatRuntimeDeps } from "../piChatRuntime";
import { useToolApprovalStore } from "../tool-permission/approvalStore";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: AgentSessionEvent) => void>(),
}));
vi.mock("@/constants", () => ({ Role: { Assistant: "assistant", User: "user" } }));
vi.mock("@/commands/piSession", () => ({
  onPiSessionEvent: (id: string, listener: (event: AgentSessionEvent) => void) => {
    mocks.listeners.set(id, listener);
    return () => mocks.listeners.delete(id);
  },
  onPiToolApprovals: vi.fn(),
  piSessionApprovals: vi.fn().mockResolvedValue({ ok: true, snapshots: [] }),
  piSessionApproveTool: vi.fn(),
}));

const key = "main-chat:21";
const sessionId = "persist-session";
const baseChat = (): ChatMessage =>
  ({
    id: 21,
    title: "新对话",
    titleDirty: false,
    createTime: 1,
    updateTime: 1,
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: [{ type: "text", text: "你好" }] },
      { role: "assistant", content: "你好！" },
    ],
  }) as unknown as ChatMessage;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const settle = () =>
  mocks.listeners.get(sessionId)?.({ type: "agent_settled" } as AgentSessionEvent);

const setup = (deps: Partial<PiChatRuntimeDeps>) => {
  const full: PiChatRuntimeDeps = {
    publish: vi.fn(),
    persist: vi.fn(async (chat: ChatMessage) => ({ ...chat, updateTime: 99 })),
    ...deps,
  };
  const container = piChatRuntime.ensureConversation(key, baseChat(), full);
  piChatRuntime.bindSession(key, sessionId);
  return { container, deps: full };
};

describe("piChatRuntime settled 落库与标题回写", () => {
  beforeEach(() => {
    useToolApprovalStore.setState({ sessions: {}, readySessions: {} });
  });
  afterEach(() => piChatRuntime.disposeConversation(key));

  it("生成的标题补丁到最新快照并落库，不被落库回写退回「新对话」", async () => {
    const { container, deps } = setup({ generateTitle: vi.fn(async () => "问候对话") });
    settle();
    await flush();

    expect(container.current).toMatchObject({ title: "问候对话", titleDirty: true });
    const lastPublished = vi.mocked(deps.publish).mock.calls.at(-1)?.[0];
    expect(lastPublished).toMatchObject({ title: "问候对话", titleDirty: true });
    const lastPersisted = vi.mocked(deps.persist).mock.calls.at(-1)?.[0];
    expect(lastPersisted).toMatchObject({ title: "问候对话", titleDirty: true });
  });

  it("落库期间容器已前进（新一轮开始）时不整体替换，保留新消息", async () => {
    const pending = deferred<ChatMessage>();
    const { container, deps } = setup({ persist: vi.fn(() => pending.promise) });
    settle();
    const persistedSnapshot = vi.mocked(deps.persist).mock.calls[0][0];

    const advanced = {
      ...container.current,
      messages: [
        ...container.current.messages,
        { role: "user", content: [{ type: "text", text: "第二条" }] },
        { role: "assistant", content: "" },
      ],
    } as ChatMessage;
    container.current = advanced;
    pending.resolve({ ...persistedSnapshot, updateTime: 99 });
    await flush();

    expect(container.current).toBe(advanced);
    expect(container.current.messages).toHaveLength(5);
    expect(deps.publish).not.toHaveBeenCalledWith(expect.objectContaining({ updateTime: 99 }));
  });

  it("标题生成期间新一轮追加的消息不被标题回写冲掉", async () => {
    const title = deferred<string | null>();
    const { container } = setup({ generateTitle: vi.fn(() => title.promise) });
    settle();
    await flush();

    container.current = {
      ...container.current,
      messages: [...container.current.messages, { role: "user", content: "第二条" }],
    } as ChatMessage;
    title.resolve("问候对话");
    await flush();

    expect(container.current.messages).toHaveLength(4);
    expect(container.current).toMatchObject({ title: "问候对话", titleDirty: true });
  });

  it("生成期间用户手动改名（titleDirty 置位）时不覆盖", async () => {
    const title = deferred<string | null>();
    const { container, deps } = setup({ generateTitle: vi.fn(() => title.promise) });
    settle();
    await flush();

    container.current = { ...container.current, title: "我的标题", titleDirty: true };
    title.resolve("问候对话");
    await flush();

    expect(container.current.title).toBe("我的标题");
    expect(deps.persist).toHaveBeenCalledTimes(1);
  });

  it("已有标题（titleDirty=true）不再生成；生成返回 null 不改标题", async () => {
    const generateTitle = vi.fn(async () => null);
    const { container } = setup({ generateTitle });
    settle();
    await flush();
    expect(generateTitle).toHaveBeenCalledTimes(1);
    expect(container.current.title).toBe("新对话");

    container.current = { ...container.current, titleDirty: true };
    settle();
    await flush();
    expect(generateTitle).toHaveBeenCalledTimes(1);
  });
});
