import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/types";
import useChatMessageStore from "../useChatMessageStore";

const mocks = vi.hoisted(() => ({
  deleteChatMessage: vi.fn(async () => 1),
  disposeChatSession: vi.fn(async () => {}),
  disposeConversation: vi.fn(),
}));

vi.mock("@/commands", () => ({
  createChatMessage: vi.fn(),
  deleteChatMessage: mocks.deleteChatMessage,
  updateChatMessage: vi.fn(),
  getAllChatMessages: vi.fn(),
  createChatGroup: vi.fn(),
  updateChatGroup: vi.fn(),
  deleteChatGroup: vi.fn(),
  getAllChatGroups: vi.fn(),
  getChatBranches: vi.fn(),
  getNextBranchIndex: vi.fn(),
  getChildBranchesCount: vi.fn(),
  pinChatMessage: vi.fn(),
  unpinChatMessage: vi.fn(),
  reorderChatMessage: vi.fn(),
}));
vi.mock("@/services/piChatSession", () => ({
  chatSessionKey: (scope: string, chatId: number) => `${scope.split(":")[0]}:${chatId}`,
  piChatSessionManager: { disposeChatSession: mocks.disposeChatSession },
}));
vi.mock("@/services/piChatRuntime", () => ({
  piChatRuntime: { disposeConversation: mocks.disposeConversation },
}));

const chat = (id: number, parentChatId?: number): ChatMessage =>
  ({
    id,
    title: `会话 ${id}`,
    messages: [],
    createTime: 1,
    updateTime: 1,
    ...(parentChatId ? { parentChatId } : {}),
  }) as unknown as ChatMessage;

describe("删除对话的运行态释放", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatMessageStore.setState({ chats: [chat(1), chat(2, 1), chat(3)], currentChatId: 1 });
  });

  it("会话与归约条目一起释放（含子分支），否则删掉的对话仍在后台落库", async () => {
    await useChatMessageStore.getState().deleteChatMessage(1);

    expect(mocks.disposeChatSession.mock.calls).toEqual([
      ["main-chat", 1],
      ["main-chat", 2],
    ]);
    expect(mocks.disposeConversation.mock.calls.flat().sort()).toEqual([
      "main-chat:1",
      "main-chat:2",
    ]);
    expect(useChatMessageStore.getState().chats.map(item => item.id)).toEqual([3]);
    expect(useChatMessageStore.getState().currentChatId).toBeNull();
  });

  it("删除非当前对话不影响选中项，也不误释放其它会话", async () => {
    await useChatMessageStore.getState().deleteChatMessage(3);

    expect(mocks.disposeConversation.mock.calls.flat()).toEqual(["main-chat:3"]);
    expect(useChatMessageStore.getState().currentChatId).toBe(1);
  });
});
