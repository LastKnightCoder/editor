// 对话页：经真实 router 入栈；AI 服务替身只在运行层发快照，覆盖新对话首发建会话、
// 流式回答、写入审批走宿主作答、未配置引导与对话记录。

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { Role } from "@tau/shared/chat-core";
import { PageHost, RouterProvider, getNavigator } from "../../../router";
import { PageQueryProvider } from "../../../router/query/PageQueryProvider";
import { AppContext, type AppContextValue } from "../../../app/AppContext";
import { useChatStore } from "../../../services/aiChat/chatController";
import type { SettingCompat } from "../../../types";
import "../../cards/pages/home.page";
import "../pages/aiChat.page";
import "../pages/aiChatHistory.page";

type Listener = (notification: unknown) => void;
const service = vi.hoisted(() => {
  const listeners = new Map<string, Listener>();
  return {
    listeners,
    sessions: {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
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
function type(value: string) {
  const textarea = activePage().querySelector("textarea")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
/** 助手消息按投影后的形状给出：正文与工具调用都在 assistant_blocks 里 */
const assistantText = (content: string) => ({
  role: Role.Assistant,
  content,
  assistant_blocks: [{ id: "b1", turnId: "t1", type: "text", state: "streaming", content }],
});
const assistantTool = (toolCallId: string, toolName: string, input: object) => ({
  role: Role.Assistant,
  content: "",
  assistant_blocks: [
    {
      id: "b2",
      turnId: "t1",
      type: "tool_call",
      state: "streaming",
      toolCall: {
        id: toolCallId,
        type: "function",
        function: { name: toolName, arguments: JSON.stringify(input) },
      },
      execution: {
        toolCallId,
        toolName,
        status: "awaiting-approval",
        input: JSON.stringify(input),
        timestamp: Date.now(),
      },
    },
  ],
});

function emit(runId: string, event: object) {
  act(() => service.listeners.get(runId)?.({ runId, seq: 1, event }));
}

// 对话页带 Markdown / 公式渲染，冷启动转译较慢；先加载懒加载的页面模块，避免计入各用例的等待
beforeAll(async () => {
  await import("../ChatPage");
  await import("../ChatHistoryPage");
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  service.listeners.clear();
  useChatStore.setState({ chats: {} });
  window.history.replaceState(null, "");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("未给对话分配模型：显示引导并可去设置", async () => {
  setting = makeSetting(false);
  mount();
  await open("aiChat", { sessionId: "s1", isNew: "1" });
  await waitFor(() => text().includes("先接一个 AI 服务"));
  expect(text()).toContain("选择对话模型");
});

it("新对话：首条消息才建会话，命名标题，流式回答后收尾", async () => {
  setting = makeSetting(true);
  service.sessions.create.mockResolvedValue(session("s1"));
  service.sessions.patch.mockResolvedValue(session("s1", [], "今天该做什么"));
  service.runs.start.mockResolvedValue({ runId: "x" });
  service.sessions.get.mockResolvedValue(session("s1", [], "今天该做什么"));
  mount();
  await open("aiChat", { sessionId: "s1", isNew: "1" });
  await waitFor(() => text().includes("想聊点什么"));
  expect(text()).toContain("DeepSeek V4");
  expect(service.sessions.create).not.toHaveBeenCalled();

  type("今天该做什么");
  await click(pressable("发送"));
  await waitFor(() => service.runs.start.mock.calls.length === 1);
  expect(service.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({ databaseName: "data.db", id: "s1", scope: "main-chat" })
  );
  const [request] = service.runs.start.mock.calls[0];
  expect(request).toMatchObject({
    session: { databaseName: "data.db", sessionId: "s1" },
    model: { providerId: "p", modelId: "m" },
    message: [{ type: "text", text: "今天该做什么" }],
    toolIds: ["host:create_todo"],
    interactionMode: "host",
  });
  const runId = request.runId as string;
  emit(runId, {
    type: "snapshot",
    snapshot: {
      status: "running",
      revision: "r2",
      approvals: [],
      questions: [],
      messages: [
        { role: Role.User, content: [{ type: "text", text: "今天该做什么" }] },
        assistantText("你今天有 3 个安排"),
      ],
    },
  });
  await waitFor(() => text().includes("你今天有 3 个安排"));
  expect(pressable("停止生成")).toBeTruthy();
  emit(runId, {
    type: "settled",
    result: { outcome: "completed", committedRevision: "r3", messages: [] },
  });
  await waitFor(() => !pressable("停止生成"));
  expect(text()).toContain("今天该做什么");
});

it("写入工具等待审批：确认条可见，点「允许」经宿主作答", async () => {
  setting = makeSetting(true);
  service.sessions.get.mockResolvedValue(session("s2", [], "建待办"));
  service.sessions.patch.mockResolvedValue(session("s2"));
  service.runs.start.mockResolvedValue({ runId: "x" });
  useChatStore.setState({
    chats: {
      s2: {
        sessionId: "s2",
        databaseName: "data.db",
        title: "建待办",
        revision: "r1",
        messages: [{ role: Role.User, content: [{ type: "text", text: "早" }] }],
        runId: null,
        status: "idle",
        approvals: [],
        questions: [],
        error: null,
        model: { providerId: "p", modelId: "m" },
      },
    },
  });
  mount();
  await open("aiChat", { sessionId: "s2" });
  await waitFor(() => text().includes("建待办"));
  type("提醒我明天交周报");
  await click(pressable("发送"));
  await waitFor(() => service.runs.start.mock.calls.length === 1);
  const runId = service.runs.start.mock.calls[0][0].runId as string;
  emit(runId, {
    type: "snapshot",
    snapshot: {
      status: "waiting-approval",
      revision: "r2",
      questions: [],
      approvals: [
        {
          requestId: "q1",
          executionId: "e1",
          toolCallId: "call-1",
          toolName: "create_todo",
          input: { title: "交周报" },
          revision: 3,
        },
      ],
      messages: [
        { role: Role.User, content: [{ type: "text", text: "提醒我明天交周报" }] },
        assistantTool("call-1", "create_todo", { title: "交周报" }),
      ],
    },
  });
  await waitFor(() => text().includes("需要你确认"));
  expect(text()).toContain("修改你的数据");
  expect(text()).toContain("新建待办");
  await click(pressable("允许"));
  await waitFor(() => service.interactions.resolveApproval.mock.calls.length === 1);
  expect(service.interactions.resolveApproval).toHaveBeenCalledWith({
    runId,
    requestId: "q1",
    executionId: "e1",
    revision: 3,
    choice: "allow",
  });
});

it("运行失败：401 显示 Key 无效与去检查", async () => {
  setting = makeSetting(true);
  service.sessions.create.mockResolvedValue(session("s3"));
  service.sessions.patch.mockResolvedValue(session("s3"));
  service.runs.start.mockResolvedValue({ runId: "x" });
  service.sessions.get.mockResolvedValue(session("s3"));
  mount();
  await open("aiChat", { sessionId: "s3", isNew: "1" });
  await waitFor(() => text().includes("想聊点什么"));
  type("你好");
  await click(pressable("发送"));
  await waitFor(() => service.runs.start.mock.calls.length === 1);
  emit(service.runs.start.mock.calls[0][0].runId, {
    type: "settled",
    result: {
      outcome: "failed",
      committedRevision: "r2",
      messages: [],
      error: { code: "AI_TRANSPORT_FAILED", message: "HTTP 401 Unauthorized" },
    },
  });
  await waitFor(() => text().includes("API Key 无效"));
  expect(pressable("去检查")).toBeTruthy();
});

it("对话记录：按时间分组，点按打开会话", async () => {
  setting = makeSetting(true);
  service.sessions.list.mockResolvedValue({
    items: [
      row("a", "复习计划"),
      { ...row("c", "关于「间隔重复」"), scope: "content-chat", domainRef: "content:12" },
      { ...row("d", "插件里的会话"), scope: "plugin:x" },
      { ...row("b", "旧对话"), updateTime: Date.now() - 30 * 86_400_000 },
    ],
    nextOffset: 4,
    hasMore: false,
  });
  service.sessions.get.mockResolvedValue(session("a", [], "复习计划"));
  mount();
  await open("aiChatHistory", {});
  await waitFor(() => text().includes("复习计划"));
  expect(text()).toContain("今天");
  expect(text()).toContain("更早");
  expect(service.sessions.list).toHaveBeenCalledWith("data.db", { offset: 0, limit: 30 });
  expect(text()).toContain("来自笔记");
  expect(text()).not.toContain("插件里的会话");
});
