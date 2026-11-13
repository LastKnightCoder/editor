import { beforeEach, expect, it, vi } from "vitest";
import { requestSuggestionContinuation, requestSuggestionRewrite } from "../follow-up";
import type { ContentSuggestion } from "@/types/content-suggestion";

const state = vi.hoisted(() => ({
  reject: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(),
  main: true,
}));
vi.mock("@/commands/content", () => ({
  contentAgentCommand: state.invoke,
  rejectContentSuggestions: state.reject,
}));
vi.mock("@/features/chat/chatSend", () => ({ sendToChat: state.send }));
vi.mock("@/electron", () => ({ isElectron: true, invoke: state.invoke, on: vi.fn() }));
vi.mock("@/utils/window-role", () => ({ isMainWindow: () => state.main }));
vi.mock("@/services/command-context", () => ({
  bindDatabaseCommands: (commands: unknown) => commands,
}));
vi.mock("../review-session", () => ({ hasLiveSuggestionReview: () => false }));

const suggestion = {
  id: "edit",
  proposalId: "proposal",
  contentId: 7,
  agentLabel: "校对",
  conversationKey: "library-a\u0000main-chat:chat:subagent:1",
  beforeText: "旧句",
  afterText: "新句",
} as ContentSuggestion;

beforeEach(() => {
  vi.resetAllMocks();
  state.main = true;
  state.send.mockResolvedValue(true);
  state.reject.mockResolvedValueOnce([suggestion.id]).mockResolvedValueOnce([]);
});

it("同时请求重写只派发一次，派发携带原资料库身份", async () => {
  await Promise.all([
    requestSuggestionRewrite("library-a", suggestion),
    requestSuggestionRewrite("library-a", suggestion),
  ]);
  expect(state.send).toHaveBeenCalledTimes(1);
  expect(state.send).toHaveBeenCalledWith({
    databaseName: "library-a",
    chatId: "chat",
    content: [expect.objectContaining({ text: expect.stringContaining("校对") })],
  });
});

it("独立窗口无法送达原资料库时返回失败", async () => {
  state.main = false;
  state.invoke.mockResolvedValue(false);
  expect(await requestSuggestionRewrite("library-a", suggestion)).toBe(false);
  expect(state.send).not.toHaveBeenCalled();
  expect(state.invoke).toHaveBeenCalledWith(
    "content:suggestions-follow-up",
    expect.objectContaining({ databaseName: "library-a", contentId: 7 })
  );
});

it.each(["accepted", "undone"] as const)(
  "从 %s 的改动续改，保持原记录并发送到原资料库和对话",
  async status => {
    const item = {
      ...suggestion,
      status,
      edit: { kind: "text", blockId: "stable-target" },
    } as ContentSuggestion;
    expect(await requestSuggestionContinuation("library-a", item, "写得更简短")).toBe(true);
    expect(state.reject).not.toHaveBeenCalled();
    expect(state.send).toHaveBeenCalledWith({
      databaseName: "library-a",
      chatId: "chat",
      content: [{ type: "text", text: expect.stringContaining("stable-target") }],
    });
    expect(state.send.mock.calls[0][0].content[0].text).toContain("写得更简短");
  }
);
