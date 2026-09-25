import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AskQuestionRenderer from "../AskQuestionRenderer";
import type { ToolCallExecutionState } from "@/types";
import { getAskQuestionSessionStore } from "@/tools/askQuestionSessionStore";
import { buildAskQuestionToolResult } from "@/tools/askQuestionTypes";

const resetAskQuestionStore = () => {
  const store = getAskQuestionSessionStore();
  Object.keys(store.records).forEach(sessionId => {
    store.removeRecord(sessionId);
  });
  localStorage.removeItem("ask-question-session");
};

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {}
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

// 选项是 tau Radio / Checkbox：按选项文案找到所在 label 里的原生 input
const findOptionInput = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll("label"))
    .find(item => item.textContent?.includes(label))
    ?.querySelector("input") ?? null;

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("AskQuestionRenderer", () => {
  beforeEach(() => {
    resetAskQuestionStore();
  });

  it("输入无法解析时应回退默认渲染", async () => {
    const execution = createExecution();
    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        inputParseError="bad json"
        renderDefault={() => <div data-testid="fallback-renderer">fallback</div>}
      />
    );

    expect(container.querySelector('[data-testid="fallback-renderer"]')).toBeTruthy();
    await unmount(root, container);
  });

  it("pending 阶段参数尚未流式完成时不应打印 warning", async () => {
    const execution = createExecution({
      status: "pending",
      input: '{"questions":[{"question":"未完成',
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        inputParseError="Unexpected end of JSON input"
        renderDefault={() => <div data-testid="fallback-renderer">fallback</div>}
      />
    );

    expect(container.querySelector('[data-testid="fallback-renderer"]')).toBeTruthy();
    expect(warnSpy).not.toHaveBeenCalled();

    await unmount(root, container);
    warnSpy.mockRestore();
  });

  it("提交答案后应写入会话存储为 submitted", async () => {
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
      />
    );

    const optionInput = findOptionInput(container, "方案 A");
    expect(optionInput).toBeTruthy();
    await act(async () => {
      optionInput?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("提交答案")
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

  it("相同 toolCallId 时应按 execution 输入匹配正确会话", async () => {
    const execution = createExecution({
      toolCallId: "call-duplicate-renderer",
      input: '{"scope":"target"}',
      timestamp: Date.now(),
    });
    const store = getAskQuestionSessionStore();

    store.createPending({
      toolCallId: execution.toolCallId,
      toolName: execution.toolName,
      conversationKey: "main-chat:old",
      rawInput: '{"scope":"old"}',
      payload: {
        title: "旧问题",
        questions: [
          {
            id: "q1",
            question: "旧对话问题",
            type: "single",
            options: [{ label: "旧选项", value: "old" }],
            required: true,
          },
        ],
      },
    });

    const targetSession = store.createPending({
      toolCallId: execution.toolCallId,
      toolName: execution.toolName,
      conversationKey: "main-chat:new",
      rawInput: execution.input,
      payload: {
        title: "新问题",
        questions: [
          {
            id: "q1",
            question: "新对话问题",
            type: "single",
            options: [{ label: "新选项", value: "new" }],
            required: true,
          },
        ],
      },
    });

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={{ ...execution, timestamp: targetSession.createdAt }}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("新对话问题");
    expect(container.textContent).not.toContain("旧对话问题");

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
        })
      ),
    });

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={parsedInput}
        renderDefault={() => <div>fallback</div>}
      />
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
        />
      );
    });

    const firstOptionInput = findOptionInput(container, "方案 A");
    expect(firstOptionInput).toBeTruthy();
    await act(async () => {
      firstOptionInput?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("问题一");

    await act(async () => {
      root.render(
        <AskQuestionRenderer
          execution={secondExecution}
          isDark={false}
          parsedInput={null}
          renderDefault={() => <div>fallback</div>}
        />
      );
    });

    const secondOptionInput = findOptionInput(container, "方案 A");
    expect(secondOptionInput).toBeTruthy();
    expect(container.textContent).toContain("问题二");
    expect(container.textContent).toContain("新的问题");

    await unmount(root, container);
  });
});
