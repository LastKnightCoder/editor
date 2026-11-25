import { beforeEach, expect, it, vi } from "vitest";
import { openSearchResult } from "../openResult";
import useChatSessionStore from "@/stores/useChatSessionStore";
import { listChatSessions } from "@/commands/chat-session";
import { piSessionTranscript } from "@/commands/piSession";
import { setChatDatabase } from "@/services/chatDatabase";
import type { ChatSessionRow } from "@/types/chat-session";

vi.mock("@/services/open-content", () => ({ openEntity: vi.fn() }));
vi.mock("@/commands/chat-session", () => ({
  createChatSession: vi.fn(),
  deleteChatSession: vi.fn(),
  listChatSessions: vi.fn(),
  pinChatSession: vi.fn(),
  unpinChatSession: vi.fn(),
  updateChatSession: vi.fn(),
}));
vi.mock("@/commands/chat-message", () => ({
  createChatGroup: vi.fn(),
  deleteChatGroup: vi.fn(),
  getAllChatGroups: vi.fn(),
  updateChatGroup: vi.fn(),
}));
vi.mock("@/commands/piSession", () => ({ piSessionEdit: vi.fn(), piSessionTranscript: vi.fn() }));

const session: ChatSessionRow = {
  id: "pdf-session",
  scope: "pdf-chat",
  domainRef: "12",
  title: "解释这一页",
  sessionFile: "session.jsonl",
  cwd: "",
  titleDirty: false,
  groupId: null,
  orderNum: null,
  archived: false,
  source: "desktop",
  messageCount: 1,
  createTime: 1,
  updateTime: 1,
};
const result = {
  type: "chat-session" as const,
  id: 0,
  sessionId: session.id,
  chatScope: "pdf-chat" as const,
  domainId: 12,
  title: session.title,
  snippet: "",
  meta: "",
  updateTime: 1,
};
const navigator = { push: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  setChatDatabase("a");
  useChatSessionStore.setState({ buckets: {}, currentIds: {}, opened: {}, groups: [] });
  vi.mocked(listChatSessions).mockResolvedValue([session]);
  vi.mocked(piSessionTranscript).mockResolvedValue({ ok: true, messages: [] });
});

it("先读取目标会话，再打开所属 PDF 对话栏，不误开主对话", async () => {
  await openSearchResult(result, navigator);
  expect(useChatSessionStore.getState().opened[session.id]?.title).toBe(session.title);
  expect(Object.values(useChatSessionStore.getState().currentIds)).toContain(session.id);
  expect(navigator.push).toHaveBeenCalledWith("pdf-detail", { pdfId: 12, chatId: session.id });
});

it("等待会话列表时切库，旧结果不能打开到新库", async () => {
  let resolve: (rows: ChatSessionRow[]) => void = () => {
    throw new Error("请求未开始");
  };
  vi.mocked(listChatSessions).mockImplementation(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  const pending = openSearchResult(result, navigator);
  await vi.waitFor(() => expect(listChatSessions).toHaveBeenCalled());
  setChatDatabase("b");
  resolve([session]);
  await expect(pending).rejects.toThrow("数据库已切换");
  expect(navigator.push).not.toHaveBeenCalled();
  expect(useChatSessionStore.getState().opened[session.id]).toBeUndefined();
});

it("会话在搜索后删除时保留当前位置并报告不存在", async () => {
  vi.mocked(listChatSessions).mockResolvedValue([]);
  await expect(openSearchResult(result, navigator)).rejects.toThrow("对话已不存在");
  expect(navigator.push).not.toHaveBeenCalled();
});
