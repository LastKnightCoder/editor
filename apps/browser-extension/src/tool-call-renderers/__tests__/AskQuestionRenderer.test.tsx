import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCallExecutionState } from "@tau/shared";
import AskQuestionRenderer from "../AskQuestionRenderer";
import { getAskQuestionSessionStore } from "@/tools/askQuestionSessionStore";
import { buildAskQuestionToolResult } from "@/tools/askQuestionTypes";

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

  it("pending 阶段参数尚未流式完成时不应打印 warning", async () => {
    const execution = createExecution({
      status: "pending",
      input: '{"questions":[{"question":"未完成',
    });
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        inputParseError="Unexpected end of JSON input"
        renderDefault={() => (
          <div data-testid="fallback-renderer">fallback</div>
        )}
      />,
    );

    expect(
      container.querySelector('[data-testid="fallback-renderer"]'),
    ).toBeTruthy();
    expect(warnSpy).not.toHaveBeenCalled();

    await unmount(root, container);
    warnSpy.mockRestore();
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

  it("仅依赖 execution.output 回填已提交答案时不应陷入无限更新", async () => {
    const parsedInput = {
      title: "确认方向",
      questions: [
        {
          id: "q1",
          question: "请选择方向",
          type: "single" as const,
          options: [
            { label: "方案 A", value: "A" },
            { label: "方案 B", value: "B" },
          ],
          required: true,
        },
      ],
    };
    const execution = createExecution({
      toolCallId: "call-renderer-output-only",
      status: "success",
      output: JSON.stringify(
        buildAskQuestionToolResult(parsedInput, {
          submittedAt: 1234567890,
          answers: [
            {
              questionId: "q1",
              selectedValues: ["A"],
              otherText: "",
            },
          ],
        }),
      ),
    });

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={parsedInput}
        renderDefault={() => <div>fallback</div>}
      />,
    );

    expect(container.textContent).toContain("答案已提交");
    expect(container.textContent).toContain("已提交：A");

    await unmount(root, container);
  });

  it("execution 切换到新的未提交问题时应清空上一题的本地选择状态", async () => {
    const firstExecution = createExecution({
      toolCallId: "call-renderer-switch-1",
      input: '{"scope":"first"}',
    });
    const secondExecution = createExecution({
      toolCallId: "call-renderer-switch-2",
      input: '{"scope":"second"}',
    });
    const store = getAskQuestionSessionStore();

    store.createPending({
      toolCallId: firstExecution.toolCallId,
      toolName: firstExecution.toolName,
      conversationKey: "main-chat:1",
      rawInput: firstExecution.input,
      payload: {
        title: "问题一",
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
    store.createPending({
      toolCallId: secondExecution.toolCallId,
      toolName: secondExecution.toolName,
      conversationKey: "main-chat:1",
      rawInput: secondExecution.input,
      payload: {
        title: "问题二",
        questions: [
          {
            id: "q1",
            question: "新的问题",
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

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AskQuestionRenderer
          execution={firstExecution}
          isDark={false}
          parsedInput={null}
          renderDefault={() => <div>fallback</div>}
        />,
      );
    });

    const firstOptionButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("方案 A"));
    expect(firstOptionButton).toBeTruthy();
    await act(async () => {
      firstOptionButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(container.textContent).toContain("问题一");
    expect(firstOptionButton?.className).toContain("border-sky-300");

    await act(async () => {
      root.render(
        <AskQuestionRenderer
          execution={secondExecution}
          isDark={false}
          parsedInput={null}
          renderDefault={() => <div>fallback</div>}
        />,
      );
    });

    const secondOptionButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("方案 A"));
    expect(container.textContent).toContain("问题二");
    expect(container.textContent).toContain("新的问题");
    expect(secondOptionButton?.className).not.toContain("border-sky-300");

    await unmount(root, container);
  });
});
