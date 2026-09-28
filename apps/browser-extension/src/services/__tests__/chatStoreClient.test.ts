/**
 * 扩展对话 RPC（M4.5）：chat.* 命令的请求形状（全部带 pageUrl、id 为 pi 会话 id）
 * 与响应解包。桌面端 handler 在 apps/desktop/src/services/aiServer.ts。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connected: true,
  sendRequest: vi.fn(),
}));

vi.mock("@/utils/WebSocketClient", () => ({
  default: class {
    onOpenHandler: (() => void) | null = null;
    onCloseHandler: (() => void) | null = null;
    connect() {}
    disconnect() {}
    get isConnected() {
      return mocks.connected;
    }
    sendRequest = mocks.sendRequest;
  },
}));
vi.mock("@/utils/aiServerAddress", () => ({ AI_SERVER_WS_URL: "ws://test" }));

import {
  closeChatStoreService,
  deleteChat,
  forkChat,
  getChatMessages,
  initChatStoreService,
  listChats,
  omitChatEntries,
  renameChat,
  rewindChat,
  switchChatVersion,
} from "../chatStoreClient";

const PAGE = "https://example.com/post";
const messages = [{ clientId: "pi:e1", role: "user", content: "你好" }];

beforeEach(() => {
  mocks.connected = true;
  initChatStoreService();
});

afterEach(() => {
  closeChatStoreService();
  vi.clearAllMocks();
});

/** 断言发出的请求并返回 mock 响应 */
const expectRequest = (method: string, params: unknown) => {
  expect(mocks.sendRequest).toHaveBeenCalledTimes(1);
  expect(mocks.sendRequest).toHaveBeenCalledWith(method, params, expect.any(Number));
};

describe("chatStoreClient RPC 形状", () => {
  it("列表按页面取，解包 chats", async () => {
    const chats = [{ id: "s1", title: "对话", createTime: 1, updateTime: 2, messageCount: 1 }];
    mocks.sendRequest.mockResolvedValue({ chats });
    expect(await listChats(PAGE)).toEqual(chats);
    expectRequest("chat.list", { pageUrl: PAGE });
  });

  it("恢复对话：按页面 + 会话 id 取投影", async () => {
    mocks.sendRequest.mockResolvedValue({ messages });
    expect(await getChatMessages(PAGE, "s1")).toEqual(messages);
    expectRequest("chat.get", { pageUrl: PAGE, id: "s1" });
  });

  it("改名 / 删除", async () => {
    mocks.sendRequest.mockResolvedValueOnce({ success: true });
    await renameChat(PAGE, "s1", "新标题");
    expectRequest("chat.rename", { pageUrl: PAGE, id: "s1", title: "新标题" });

    mocks.sendRequest.mockClear();
    mocks.sendRequest.mockResolvedValueOnce({ success: true });
    await deleteChat(PAGE, "s1");
    expectRequest("chat.delete", { pageUrl: PAGE, id: "s1" });
  });

  it("会话树（M4-d）：从这里建分支、切版本都在同一个对话里，按 entry id，返回投影", async () => {
    mocks.sendRequest.mockResolvedValue({ messages });
    expect(await forkChat(PAGE, "s1", "e3")).toEqual(messages);
    expectRequest("chat.fork", { pageUrl: PAGE, id: "s1", entryId: "e3" });

    mocks.sendRequest.mockClear();
    expect(await switchChatVersion(PAGE, "s1", "e7")).toEqual(messages);
    expectRequest("chat.switch", { pageUrl: PAGE, id: "s1", entryId: "e7" });
  });

  it("改历史：回退按 entry id，删除按一组 entry id，都返回改后的投影", async () => {
    mocks.sendRequest.mockResolvedValue({ messages });
    expect(await rewindChat(PAGE, "s1", "e1")).toEqual(messages);
    expectRequest("chat.rewind", { pageUrl: PAGE, id: "s1", entryId: "e1" });

    mocks.sendRequest.mockClear();
    expect(await omitChatEntries(PAGE, "s1", ["e2", "e3"])).toEqual(messages);
    expectRequest("chat.omit", { pageUrl: PAGE, id: "s1", entryIds: ["e2", "e3"] });
  });

  it("桌面未连接时直接拒绝，不发请求", async () => {
    mocks.connected = false;
    await expect(listChats(PAGE)).rejects.toThrow("桌面端未连接");
    expect(mocks.sendRequest).not.toHaveBeenCalled();
  });
});
