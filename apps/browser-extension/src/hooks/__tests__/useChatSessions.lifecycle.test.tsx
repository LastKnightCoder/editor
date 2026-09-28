import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));
vi.mock("../../services/chatStoreClient", () => ({
  listChats: state.list,
  getChatMessages: state.get,
  subscribeChatStoreConnection: (listener: (value: boolean) => void) => {
    listener(true);
    return () => {};
  },
  deleteChat: vi.fn(),
  forkChat: vi.fn(),
  omitChatEntries: vi.fn(),
  renameChat: vi.fn(),
  rewindChat: vi.fn(),
  switchChatVersion: vi.fn(),
}));
vi.mock("../../services/chatModelBridge", () => ({
  toDisplayMessages: (messages: unknown) => messages,
}));
import { useChatSessions } from "../useChatSessions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
async function mount(url: string) {
  const root = createRoot(document.createElement("div"));
  const result = { current: undefined as unknown as ReturnType<typeof useChatSessions> };
  function Probe() {
    result.current = useChatSessions(url);
    return null;
  }
  await act(async () => root.render(<Probe />));
  return { result, unmount: () => act(() => root.unmount()) };
}
beforeEach(() => {
  localStorage.clear();
  state.list.mockResolvedValue([]);
  state.get.mockResolvedValue([]);
});

it("未落盘首轮重开保留运行身份，hash 变化不改变会话", async () => {
  const first = await mount("https://example.invalid/page#one");
  const activeId = first.result.current.currentSession.id;
  first.unmount();
  const reopened = await mount("https://example.invalid/page#two");
  expect(reopened.result.current.currentSession.id).toBe(activeId);
  expect(reopened.result.current.sessions).toEqual([]);
  expect(state.list).toHaveBeenCalledWith("https://example.invalid/page");
  reopened.unmount();
});

it("A 的迟到投影不能覆盖后来选择的 B", async () => {
  state.list.mockResolvedValue(["initial", "a", "b"].map(id => ({ id, title: id })));
  let resolveA!: (value: unknown) => void;
  state.get.mockImplementation(async (_url: string, id: string) =>
    id === "a"
      ? new Promise(resolve => {
          resolveA = resolve;
        })
      : [{ role: "user", content: id }]
  );
  const hook = await mount("https://example.invalid");
  let pendingA!: Promise<void>;
  act(() => {
    pendingA = hook.result.current.selectSession("a");
  });
  await act(async () => {
    await hook.result.current.selectSession("b");
  });
  await act(async () => {
    resolveA([{ role: "user", content: "A 的内容" }]);
    await pendingA;
  });
  expect(hook.result.current.currentSession.id).toBe("b");
  expect(hook.result.current.messages[0].content).toBe("b");
  hook.unmount();
});
