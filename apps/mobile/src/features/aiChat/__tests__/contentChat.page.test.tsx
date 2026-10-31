// 就近对话页：内容页「问 AI」推入的整页对话。首次在首条消息时以 content-chat 建会话、引用随消息发出；
// 同一篇再次进入续上最近一次会话；原文条展开正文并高亮选中片段。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PageHost, RouterProvider, getNavigator } from "../../../router";
import { PageQueryProvider } from "../../../router/query/PageQueryProvider";
import { AppContext, type AppContextValue } from "../../../app/AppContext";
import { useChatStore } from "../../../services/aiChat/chatController";
import type { SettingCompat } from "../../../types";
import "../../cards/pages/home.page";
import "../pages/aiChat.page";
import "../pages/aiContentChat.page";

type Listener = (notification: unknown) => void;
const service = vi.hoisted(() => {
  const listeners = new Map<string, Listener>();
  return {
    listeners,
    tools: { list: vi.fn(() => []) },
    sessions: {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
      editHistory: vi.fn(),
    },
    runs: {
      start: vi.fn(),
      abort: vi.fn(),
      subscribe: vi.fn((runId: string, listener: Listener) => {
        listeners.set(runId, listener);
        return () => listeners.delete(runId);
      }),
    },
    interactions: { resolveApproval: vi.fn(), answerQuestion: vi.fn() },
  };
});
vi.mock("../../../services/ai", () => ({ getMobileAiService: () => service }));
vi.mock("../../../services/aiChat/hostTools", () => ({
  registerHostCapabilities: () => ({ toolIds: ["host:create_todo"], dispose: vi.fn() }),
}));
vi.mock("../../../services/tauri", () => ({
  getContentDetail: vi.fn(async () => ({
    content: [
      {
        type: "paragraph",
        children: [{ text: "遗忘曲线告诉我们，记忆在学习后的最初几天衰减最快。" }],
      },
    ],
  })),
}));
vi.mock("../../../components/toast", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

let setting: SettingCompat;
let host: HTMLDivElement;
let root: Root;

const row = (id: string, title = "新对话") => ({
  id,
  scope: "main-chat",
  title,
  updateTime: Date.now(),
  messageCount: 0,
});
const session = (id: string, messages: unknown[] = [], title = "新对话") => ({
  row: row(id, title),
  revision: "r1",
  messages,
});

function makeSetting(assigned: boolean): SettingCompat {
  return {
    database: { active: "data.db", databases: [] },
    llmProviders: [
      {
        id: "p",
        name: "DeepSeek",
        baseUrl: "https://x.test",
        api: "openai-completions",
        configured: true,
        models: [{ id: "m", name: "DeepSeek V4", reasoning: false, input: ["text"] }],
      },
    ],
    llmUsageSettings: { chat: assigned ? { providerId: "p", modelId: "m" } : null },
  } as unknown as SettingCompat;
}

function mount() {
  const app = {
    syncSettings: {
      get safeSetting() {
        return setting;
      },
    },
  } as unknown as AppContextValue;
  act(() =>
    root.render(
      <PageQueryProvider>
        <RouterProvider rootKey="home">
          <AppContext.Provider value={app}>
            <PageHost rootContent={<div />} />
          </AppContext.Provider>
        </RouterProvider>
      </PageQueryProvider>
    )
  );
}

const activePage = () => document.querySelector('[data-page-active="true"]')!;
const text = () => activePage()?.textContent ?? "";
async function waitFor(condition: () => boolean) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 3000) throw new Error(`waitFor 超时：${text().slice(0, 200)}`);
    await act(async () => new Promise(resolve => setTimeout(resolve, 25)));
  }
}
async function open(page: string, params: object) {
  await act(async () => {
    getNavigator().push(page as never, params as never);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
const pressable = (label: string, scope: ParentNode = activePage()) =>
  [...scope.querySelectorAll<HTMLElement>("button, [role='button']")].find(node =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  );
async function click(element: HTMLElement | undefined) {
  if (!element) throw new Error("找不到可点击元素");
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
}

const target = {
  contentId: 12,
  entityType: "card",
  entityId: 3,
  title: "间隔重复为什么有效",
  quote: "记忆在学习后的最初几天衰减最快",
};

beforeAll(async () => {
  await import("../ChatPage");
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  useChatStore.setState({ chats: {} });
  window.history.replaceState(null, "");
  setting = makeSetting(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("首次就近提问：选中片段作为引用，快捷问法发出时以 content-chat 建会话", async () => {
  service.sessions.list.mockResolvedValue({ items: [], nextOffset: 0, hasMore: false });
  service.sessions.create.mockImplementation(async (input: { id: string; title: string }) => ({
    row: { id: input.id, title: input.title },
    revision: "r1",
    messages: [],
  }));
  service.runs.start.mockResolvedValue({ runId: "x" });
  mount();
  await open("aiContentChat", target);
  await waitFor(() => text().includes("关于这张卡片"));
  expect(service.sessions.list).toHaveBeenCalledWith("data.db", {
    scope: "content-chat",
    domainRef: "content:12",
    limit: 1,
  });
  expect(text()).toContain("记忆在学习后的最初几天衰减最快");
  expect(pressable("新对话")).toBeUndefined();
  expect(service.sessions.create).not.toHaveBeenCalled();

  await click(pressable("解释这段"));
  await waitFor(() => service.runs.start.mock.calls.length === 1);
  expect(service.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: "content-chat",
      domainRef: "content:12",
      title: "关于「间隔重复为什么有效」",
    })
  );
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

it("同一篇再次进入：续上最近一次就近对话，整篇提问给出整篇快捷问法", async () => {
  service.sessions.list.mockResolvedValue({
    items: [{ id: "old", scope: "content-chat", domainRef: "content:12" }],
    nextOffset: 1,
    hasMore: false,
  });
  service.sessions.get.mockResolvedValue(
    session("old", [{ role: "user", content: [{ type: "text", text: "上次的问题" }] }])
  );
  mount();
  await open("aiContentChat", { ...target, quote: undefined });
  await waitFor(() => text().includes("上次的问题"));
  expect(service.sessions.get).toHaveBeenCalledWith({ databaseName: "data.db", sessionId: "old" });
  expect(pressable("总结这篇")).toBeTruthy();
});

it("原文条：点「看原文」展开正文并高亮选中片段，再点收起", async () => {
  service.sessions.list.mockResolvedValue({ items: [], nextOffset: 0, hasMore: false });
  mount();
  await open("aiContentChat", target);
  await waitFor(() => !!pressable("间隔重复为什么有效"));
  await click(pressable("间隔重复为什么有效"));
  await waitFor(() => !!activePage().querySelector("mark"));
  expect(activePage().querySelector("mark")!.textContent).toBe(target.quote);
  expect(text()).toContain("遗忘曲线告诉我们");
  await click(pressable("间隔重复为什么有效"));
  expect(activePage().querySelector("mark")).toBeNull();
});
