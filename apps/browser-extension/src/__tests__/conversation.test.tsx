import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyChatStreamEvent,
  createAssistantMessage,
  Role,
  type ToolCallExecutionState,
} from "@tau/shared/chat-core";
import { configureToolInteractions, registerInteractionRenderers } from "@tau/chat-ui/conversation";
import { ControllerContext } from "../content/ui/context";
import { ChatTab } from "../content/ui/ChatTab";
import { createInteractionHost } from "../content/state/interactions";
import { initialChat, useCompanion } from "../content/state/store";

const chat = {
  content: () => ({ blocks: [], length: 1200, title: "", url: "" }),
  ask: vi.fn(),
  abort: vi.fn(),
  approve: vi.fn(async () => {}),
  answer: vi.fn(async () => {}),
  openInTau: vi.fn(async () => {}),
};
const controller = { chat, appendToNote: vi.fn(), scrollToBlock: vi.fn() } as never;

const assistantWith = (executions: ToolCallExecutionState[], text = "") => {
  const message = createAssistantMessage();
  if (text) applyChatStreamEvent(message, { type: "text", turnId: "t1", fullText: text });
  applyChatStreamEvent(message, { type: "tool-calls", turnId: "t1", executions });
  return message;
};

const execution = (overrides: Partial<ToolCallExecutionState>): ToolCallExecutionState => ({
  toolCallId: "call-1",
  toolName: "create_todo",
  status: "success",
  input: '{"title":"复习"}',
  output: "ok",
  timestamp: 0,
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;
const render = () =>
  act(() =>
    root.render(
      <ControllerContext.Provider value={controller}>
        <ChatTab />
      </ControllerContext.Provider>
    )
  );
const buttonByText = (text: string) =>
  [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === text);

beforeEach(() => {
  configureToolInteractions(createInteractionHost(chat as never));
  registerInteractionRenderers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  configureToolInteractions(null);
  vi.clearAllMocks();
});

describe("扩展对话与桌面同一套消息渲染", () => {
  it("等待审批的工具行下方出现审批条，允许经 Tau 提交", async () => {
    useCompanion.setState({
      status: { state: "ready", scopes: ["chat", "annotations", "notes", "tools"] },
      chat: {
        ...initialChat("s"),
        runId: "r1",
        messages: [
          { role: Role.User, content: "帮我建个待办" },
          assistantWith([execution({ status: "awaiting-approval", output: undefined })]),
        ],
        approvals: [
          {
            requestId: "a1",
            toolCallId: "call-1",
            toolName: "create_todo",
            risk: "write",
            input: '{"title":"复习"}',
            requestedAt: 0,
          },
        ],
      },
    });
    render();
    expect(container.textContent).toContain("AI 想要修改内容，需要你确认");
    expect(container.textContent).toContain("可在 Tau 设置「AI 服务 · 工具权限」里改为自动");
    await act(async () => buttonByText("本会话始终允许")!.click());
    expect(chat.approve).toHaveBeenCalledWith("a1", "allow-session");
  });

  it("ask-question 提问卡与桌面同一实现，作答经 Tau 提交", async () => {
    useCompanion.setState({
      status: { state: "ready", scopes: ["chat", "annotations", "notes", "tools"] },
      chat: {
        ...initialChat("s"),
        runId: "r1",
        messages: [
          { role: Role.User, content: "帮我规划" },
          assistantWith([
            execution({
              toolCallId: "q-call",
              toolName: "ask-question",
              status: "executing",
              input: "{}",
              output: undefined,
            }),
          ]),
        ],
        questions: [
          {
            requestId: "q1",
            toolCallId: "q-call",
            askedAt: 0,
            payload: {
              title: "选个方向",
              questions: [
                {
                  id: "a",
                  question: "先做哪个？",
                  type: "single",
                  required: true,
                  options: [
                    { label: "甲", value: "x" },
                    { label: "乙", value: "y" },
                  ],
                },
              ],
            },
          },
        ],
      },
    });
    render();
    expect(container.textContent).toContain("先做哪个？");
    const option = [...container.querySelectorAll("label")]
      .find(item => item.textContent?.includes("甲"))!
      .querySelector("input")!;
    await act(async () => option.click());
    await act(async () => buttonByText("提交答案")!.click());
    expect(chat.answer).toHaveBeenCalledWith("q1", [
      { questionId: "a", selectedValues: ["x"], otherText: "" },
    ]);
  });

  it("应用工具完成后是通用工具行，带「在 Tau 中查看」；页面工具没有", async () => {
    useCompanion.setState({
      status: { state: "ready", scopes: ["chat", "annotations", "notes", "tools"] },
      chat: {
        ...initialChat("s"),
        messages: [
          { role: Role.User, content: "看看" },
          assistantWith(
            [execution({}), execution({ toolCallId: "call-2", toolName: "read_page" })],
            "好的 [1]"
          ),
        ],
      },
    });
    render();
    const views = [...container.querySelectorAll("button")].filter(item =>
      item.textContent?.includes("在 Tau 中查看")
    );
    expect(views).toHaveLength(1);
    await act(async () => views[0].click());
    expect(chat.openInTau).toHaveBeenCalled();
    // 段落引用画成可点的编号
    const cite = container.querySelector('button[title="定位到原文"]');
    expect(cite?.textContent).toBe("1");
  });
});
