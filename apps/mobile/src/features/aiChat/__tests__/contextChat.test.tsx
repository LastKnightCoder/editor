// 半屏就近对话：首次打开在首条消息时以 content-chat 作用域建会话，引用随消息发出；
// 同一篇再次打开续上最近一次会话。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { RouterProvider } from "../../../router";
import { PageQueryProvider } from "../../../router/query/PageQueryProvider";
import { AppContext, type AppContextValue } from "../../../app/AppContext";
import { useChatStore } from "../../../services/aiChat/chatController";
import type { SettingCompat } from "../../../types";
import type { ContextChatTarget } from "../ContextChatSheet";

const service = vi.hoisted(() => ({
  sessions: { create: vi.fn(), get: vi.fn(), list: vi.fn(), patch: vi.fn() },
  runs: { start: vi.fn(), abort: vi.fn(), subscribe: vi.fn(() => () => undefined) },
  interactions: {},
}));
vi.mock("../../../services/ai", () => ({ getMobileAiService: () => service }));
vi.mock("../../../services/aiChat/hostTools", () => ({
  registerHostCapabilities: () => ({ toolIds: [], dispose: vi.fn() }),
}));
vi.mock("../../../components/toast", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

let ContextChatSheet: typeof import("../ContextChatSheet").ContextChatSheet;
beforeAll(async () => {
  ({ ContextChatSheet } = await import("../ContextChatSheet"));
}, 60_000);

const setting = {
  database: { active: "data.db", databases: [] },
  llmProviders: [
    {
      id: "p",
      name: "P",
      baseUrl: "https://x.test",
      api: "openai-completions",
      configured: true,
      models: [{ id: "m", reasoning: false, input: ["text"] }],
    },
  ],
  llmUsageSettings: { chat: { providerId: "p", modelId: "m" } },
} as unknown as SettingCompat;

const target: ContextChatTarget = {
  contentId: 12,
  entityType: "card",
  entityId: 3,
  title: "间隔重复为什么有效",
  quote: "记忆在学习后的最初几天衰减最快",
};

let host: HTMLDivElement;
let root: Root;

function mount(value: ContextChatTarget) {
  const app = { syncSettings: { safeSetting: setting } } as unknown as AppContextValue;
  act(() =>
    root.render(
      <PageQueryProvider>
        <RouterProvider rootKey="home">
          <AppContext.Provider value={app}>
            <ContextChatSheet target={value} onClose={() => undefined} />
          </AppContext.Provider>
        </RouterProvider>
      </PageQueryProvider>
    )
  );
}
const body = () => document.body.textContent ?? "";
async function waitFor(condition: () => boolean) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 3000) throw new Error(`waitFor 超时：${body().slice(0, 200)}`);
    await act(async () => new Promise(resolve => setTimeout(resolve, 25)));
  }
}
const button = (label: string) =>
  [...document.body.querySelectorAll<HTMLElement>("button")].find(
    node => (node.getAttribute("aria-label") ?? node.textContent ?? "").trim() === label
  );

beforeEach(() => {
  vi.clearAllMocks();
  useChatStore.setState({ chats: {} });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

it("首次就近提问：选中片段作为引用，快捷问法发出时以 content-chat 建会话", async () => {
  service.sessions.list.mockResolvedValue({ items: [], nextOffset: 0, hasMore: false });
  service.sessions.create.mockImplementation(async input => ({
    row: { id: input.id, title: input.title },
    revision: "r1",
    messages: [],
  }));
  service.runs.start.mockResolvedValue({ runId: "x" });
  mount(target);
  await waitFor(() => body().includes("关于这张卡片"));
  expect(service.sessions.list).toHaveBeenCalledWith("data.db", {
    scope: "content-chat",
    domainRef: "content:12",
    limit: 1,
  });
  expect(body()).toContain("记忆在学习后的最初几天衰减最快");
  expect(service.sessions.create).not.toHaveBeenCalled();

  await act(async () => button("解释这段")!.click());
  await waitFor(() => service.runs.start.mock.calls.length === 1);
  expect(service.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: "content-chat",
      domainRef: "content:12",
      title: "关于「间隔重复为什么有效」",
    })
  );
  expect(service.sessions.patch).not.toHaveBeenCalled();
  const [request] = service.runs.start.mock.calls[0];
  expect(request.message).toEqual([
    {
      type: "text",
      text: "解释这段",
      mentions: [
        {
          entityType: "card",
          entityId: 3,
          contentId: 12,
          title: "间隔重复为什么有效",
          previewText: "记忆在学习后的最初几天衰减最快",
          quote: true,
        },
      ],
    },
  ]);
});

it("同一篇再次打开：续上最近一次就近对话", async () => {
  service.sessions.list.mockResolvedValue({
    items: [{ id: "old", scope: "content-chat", domainRef: "content:12" }],
    nextOffset: 1,
    hasMore: false,
  });
  service.sessions.get.mockResolvedValue({
    row: { id: "old", title: "关于「间隔重复为什么有效」" },
    revision: "r5",
    messages: [{ role: "user", content: [{ type: "text", text: "上次的问题" }] }],
  });
  mount({ ...target, quote: undefined });
  await waitFor(() => body().includes("上次的问题"));
  expect(service.sessions.get).toHaveBeenCalledWith({ databaseName: "data.db", sessionId: "old" });
  expect(button("总结这篇")).toBeTruthy();
});
