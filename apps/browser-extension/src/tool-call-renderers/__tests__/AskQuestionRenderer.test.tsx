import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { ToolCallExecutionState } from "@tau/shared";
import AskQuestionRenderer from "../AskQuestionRenderer";
import { getAskQuestionSessionStore } from "@/tools/askQuestionSessionStore";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const resetAskQuestionStore = () => {
  const store = getAskQuestionSessionStore();
  Object.keys(store.records).forEach((sessionId) => {
    store.removeRecord(sessionId);
  });
  localStorage.removeItem("ask-question-session");
};

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {},
): ToolCallExecutionState => ({
  toolCallId: "call-renderer-1",
  toolName: "ask-question",
  status: "pending",
  input: "{}",
  timestamp: Date.now(),
  ...overrides,
});

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("extension AskQuestionRenderer", () => {
  beforeEach(() => {
    resetAskQuestionStore();
  });

  it("输入无法解析时回退默认渲染", async () => {
    const execution = createExecution();
    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        inputParseError="bad json"
        renderDefault={() => (
          <div data-testid="fallback-renderer">fallback</div>
        )}
      />,
    );

    expect(
      container.querySelector('[data-testid="fallback-renderer"]'),
    ).toBeTruthy();
    await unmount(root, container);
  });

  it("提交答案后写入 submitted 会话状态", async () => {
    const execution = createExecution({
      toolCallId: "call-renderer-submit",
    });
    const store = getAskQuestionSessionStore();
    const session = store.createPending({
      toolCallId: execution.toolCallId,
      toolName: execution.toolName,
      conversationKey: "main-chat:1",
      rawInput: execution.input,
      payload: {
        title: "确认方向",
        questions: [
          {
            id: "q1",
            question: "请选择方向",
            type: "single",
            options: [
              { label: "方案 A", value: "A" },
              { label: "方案 B", value: "B" },
            ],
            required: true,
          },
        ],
      },
    });

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />,
    );

    const optionButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("方案 A"),
    );
    expect(optionButton).toBeTruthy();
    await act(async () => {
      optionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("提交答案"),
    );
    expect(submitButton).toBeTruthy();
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const record = getAskQuestionSessionStore().records[session.sessionId];
    expect(record?.status).toBe("submitted");
    expect(record?.submittedAnswers?.answers[0]?.selectedValues).toEqual(["A"]);

    await unmount(root, container);
  });
});
