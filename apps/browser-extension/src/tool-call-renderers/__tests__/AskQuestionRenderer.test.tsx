import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCallExecutionState } from "@tau/shared";
import AskQuestionRenderer from "../AskQuestionRenderer";
import { buildAskQuestionToolResult } from "@/tools/askQuestionTypes";
import { useRunInteractionStore } from "@/stores/useRunInteractionStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const resetRunInteractions = () => {
  useRunInteractionStore.setState({ approvals: [], questions: [], answer: null, approve: null });
};

/** 桌面宿主在等这些调用作答（提问改走宿主原生，M5） */
const hostAsks = (
  asks: Array<{ toolCallId: string; payload: unknown }>,
  answer: (requestId: string, answers: unknown) => Promise<void> = async () => {}
) => {
  useRunInteractionStore.setState({
    questions: asks.map((ask, index) => ({
      requestId: `req-${index}`,
      toolCallId: ask.toolCallId,
      payload: ask.payload,
      askedAt: index,
    })),
    answer,
  });
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

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

// 选项是 tau Radio / Checkbox：按选项文案找到所在 label 里的原生 input
const findOptionInput = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll("label"))
    .find(item => item.textContent?.includes(label))
    ?.querySelector("input");

describe("extension AskQuestionRenderer", () => {
  beforeEach(() => {
    resetRunInteractions();
  });

  it("输入无法解析时回退默认渲染", async () => {
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

  it("宿主在等时可作答：答案数组发回宿主，提交后锁定", async () => {
    const execution = createExecution({
      toolCallId: "call-renderer-submit",
    });
    const answer = vi.fn(async () => {});
    hostAsks(
      [
        {
          toolCallId: execution.toolCallId,
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
        },
      ],
      answer
    );

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    const optionButton = findOptionInput(container, "方案 A");
    expect(optionButton).toBeTruthy();
    await act(async () => {
      optionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("提交答案")
    );
    expect(submitButton).toBeTruthy();
    await act(async () => {
      submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(answer).toHaveBeenCalledWith("req-0", [
      { questionId: "q1", selectedValues: ["A"], otherText: "" },
    ]);
    expect(container.textContent).toContain("答案已提交");

    await unmount(root, container);
  });

  it("宿主不在等、也没有结果：显示提问已结束且不可提交", async () => {
    // 重启后宿主补了失败结果（M4-e）
    const execution = createExecution({
      toolCallId: "call-renderer-gone",
      status: "failed",
      error: "应用重启，这次工具调用已中断",
    });
    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={{
          questions: [{ id: "q1", question: "请选择方向", type: "single", options: ["A", "B"] }],
        }}
        renderDefault={() => <div>fallback</div>}
      />
    );
    expect(container.textContent).toContain("提问已结束");
    const submitButton = Array.from(container.querySelectorAll("button")).find(button =>
      button.textContent?.includes("提交答案")
    );
    expect(submitButton?.disabled).toBe(true);
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
    hostAsks([
      {
        toolCallId: firstExecution.toolCallId,
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
      },
      {
        toolCallId: secondExecution.toolCallId,
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
      },
    ]);

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

    const firstOptionButton = findOptionInput(container, "方案 A");
    expect(firstOptionButton).toBeTruthy();
    await act(async () => {
      firstOptionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("问题一");
    expect(firstOptionButton?.checked).toBe(true);

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

    const secondOptionButton = findOptionInput(container, "方案 A");
    expect(container.textContent).toContain("问题二");
    expect(container.textContent).toContain("新的问题");
    expect(secondOptionButton?.checked).toBe(false);

    await unmount(root, container);
  });
});
