/**
 * 一轮结束后的收尾（M4）：内容由 pi 自己写进 JSONL，runtime 在 agent_settled 后重读投影回写
 * 容器（按位置沿用原 clientId），再生成标题并写目录行。这里覆盖：投影回写、竞态、标题。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ChatMessage, ChatSessionMessage } from "@/types";
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

const chatId = "chat-21";
const key = `main-chat:${chatId}`;
const sessionId = "settle-session";
const baseChat = (): ChatMessage =>
  ({
    id: chatId,
    title: "新对话",
    titleDirty: false,
    createTime: 1,
    updateTime: 1,
    sessionFile: "f.jsonl",
    messages: [
      { clientId: "local-user", role: "user", content: [{ type: "text", text: "你好" }] },
      { clientId: "local-answer", role: "assistant", content: "你好！" },
    ],
  }) as unknown as ChatMessage;

/** 投影：clientId 是 `pi:<entryId>`（与本地乐观写入的不同），另带 entry id */
const transcript = (): ChatSessionMessage[] =>
  [
    {
      clientId: "pi:e1",
      piEntryIds: ["e1"],
      role: "user",
      content: [{ type: "text", text: "你好" }],
    },
    { clientId: "pi:e2", piEntryIds: ["e2"], role: "assistant", content: "你好！" },
  ] as unknown as ChatSessionMessage[];

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
const settleEvent = () =>
  mocks.listeners.get(sessionId)?.({ type: "agent_settled" } as AgentSessionEvent);

const setup = (deps: Partial<PiChatRuntimeDeps>) => {
  const full: PiChatRuntimeDeps = {
    publish: vi.fn(),
    settle: vi.fn(async () => transcript()),
    ...deps,
  };
  const container = piChatRuntime.ensureConversation(key, baseChat(), full);
  piChatRuntime.bindSession(key, sessionId);
  return { container, deps: full };
};

describe("piChatRuntime settled 投影回写与标题", () => {
  beforeEach(() => {
    usePiInteractionStore.setState({ sessions: {}, readySessions: {} });
  });
  afterEach(() => piChatRuntime.disposeConversation(key));

  it("用投影回写消息，但按位置沿用原 clientId（避免列表重挂载）", async () => {
    const { container, deps } = setup({});
    settleEvent();
    await flush();

    expect(container.current.messages.map(message => message.clientId)).toEqual([
      "local-user",
      "local-answer",
    ]);
    // 投影带回的 entry id 保留下来：改历史操作按它定位
    expect(container.current.messages.map(message => message.piEntryIds)).toEqual([["e1"], ["e2"]]);
    expect(deps.publish).toHaveBeenCalled();
  });

  it("没有可读投影（首轮失败、文件未落盘）时保留界面上的消息", async () => {
    const { container } = setup({ settle: vi.fn(async () => null) });
    settleEvent();
    await flush();
    expect(container.current.messages).toHaveLength(2);
    expect(container.current.messages[1]).toMatchObject({ content: "你好！" });
  });

  it("读投影期间容器已前进（排队消息开了新一轮）时不回写，保留新消息", async () => {
    const pending = deferred<ChatSessionMessage[]>();
    const { container } = setup({ settle: vi.fn(() => pending.promise) });
    settleEvent();

    const advanced = {
      ...container.current,
      messages: [
        ...container.current.messages,
        { role: "user", content: [{ type: "text", text: "第二条" }] },
        { role: "assistant", content: "" },
      ],
    } as ChatMessage;
    container.current = advanced;
    pending.resolve(transcript());
    await flush();

    expect(container.current).toBe(advanced);
    expect(container.current.messages).toHaveLength(4);
  });

  it("生成的标题补丁到最新快照并写目录行", async () => {
    const saveTitle = vi.fn(async () => undefined);
    const { container, deps } = setup({
      generateTitle: vi.fn(async () => "问候对话"),
      saveTitle,
    });
    settleEvent();
    await flush();

    expect(container.current).toMatchObject({ title: "问候对话", titleDirty: true });
    expect(saveTitle).toHaveBeenCalledWith(chatId, "问候对话");
    const lastPublished = vi.mocked(deps.publish).mock.calls.at(-1)?.[0];
    expect(lastPublished).toMatchObject({ title: "问候对话", titleDirty: true });
  });

  it("标题生成期间新一轮追加的消息不被标题回写冲掉", async () => {
    const title = deferred<string | null>();
    const { container } = setup({ generateTitle: vi.fn(() => title.promise) });
    settleEvent();
    await flush();

    container.current = {
      ...container.current,
      messages: [...container.current.messages, { role: "user", content: "第二条" }],
    } as ChatMessage;
    title.resolve("问候对话");
    await flush();

    expect(container.current.messages).toHaveLength(3);
    expect(container.current).toMatchObject({ title: "问候对话", titleDirty: true });
  });

  it("生成期间用户手动改名（titleDirty 置位）时不覆盖", async () => {
    const title = deferred<string | null>();
    const saveTitle = vi.fn(async () => undefined);
    const { container } = setup({ generateTitle: vi.fn(() => title.promise), saveTitle });
    settleEvent();
    await flush();

    container.current = { ...container.current, title: "我的标题", titleDirty: true };
    title.resolve("问候对话");
    await flush();

    expect(container.current.title).toBe("我的标题");
    expect(saveTitle).not.toHaveBeenCalled();
  });

  it("已有标题（titleDirty=true）不再生成；生成返回 null 不改标题", async () => {
    const generateTitle = vi.fn(async () => null);
    const { container } = setup({ generateTitle });
    settleEvent();
    await flush();
    expect(generateTitle).toHaveBeenCalledTimes(1);
    expect(container.current.title).toBe("新对话");

    container.current = { ...container.current, titleDirty: true };
    settleEvent();
    await flush();
    expect(generateTitle).toHaveBeenCalledTimes(1);
  });
});
