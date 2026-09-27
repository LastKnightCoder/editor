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
  branchChat,
  closeChatStoreService,
  deleteChat,
  getChatMessages,
  initChatStoreService,
  listChats,
  omitChatEntries,
  renameChat,
  rewindChat,
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
    const chats = [
      { id: "s1", title: "对话", parentId: null, createTime: 1, updateTime: 2, messageCount: 1 },
    ];
    mocks.sendRequest.mockResolvedValue({ chats });
    expect(await listChats(PAGE)).toEqual(chats);
    expectRequest("chat.list", { pageUrl: PAGE });
  });

  it("恢复对话：按页面 + 会话 id 取投影", async () => {
    mocks.sendRequest.mockResolvedValue({ messages });
    expect(await getChatMessages(PAGE, "s1")).toEqual(messages);
    expectRequest("chat.get", { pageUrl: PAGE, id: "s1" });
  });

  it("改名 / 删除（返回连带删除的分支 id）", async () => {
    mocks.sendRequest.mockResolvedValueOnce({ success: true });
    await renameChat(PAGE, "s1", "新标题");
    expectRequest("chat.rename", { pageUrl: PAGE, id: "s1", title: "新标题" });

    mocks.sendRequest.mockClear();
    mocks.sendRequest.mockResolvedValueOnce({ deletedIds: ["s1", "s2"] });
    expect(await deleteChat(PAGE, "s1")).toEqual(["s1", "s2"]);
    expectRequest("chat.delete", { pageUrl: PAGE, id: "s1" });
  });

  it("建分支：缺省整条不带 throughEntryId，截断时带上", async () => {
    mocks.sendRequest.mockResolvedValue({ id: "b1", messages });
    expect(await branchChat(PAGE, "s1")).toEqual({ id: "b1", messages });
    expectRequest("chat.branch", { pageUrl: PAGE, id: "s1" });

    mocks.sendRequest.mockClear();
    await branchChat(PAGE, "s1", "e3");
    expectRequest("chat.branch", { pageUrl: PAGE, id: "s1", throughEntryId: "e3" });
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
