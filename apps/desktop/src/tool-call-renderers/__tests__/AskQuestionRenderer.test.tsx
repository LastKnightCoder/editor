import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AskQuestionRenderer from "../AskQuestionRenderer";
import type { ToolCallExecutionState } from "@/types";
import type { PiUserQuestionRequest } from "@/types/pi-session";
import { buildAskQuestionToolResult, type AskQuestionPayload } from "@/tools/askQuestionTypes";
import {
  receiveInteractions,
  setInteractionSessionReady,
  usePiInteractionStore,
} from "@/services/piInteractions";
import { piSessionAnswerQuestion, piSessionInteractions } from "@/commands/piSession";

vi.mock("@/commands/piSession", () => ({
  onPiSessionInteractions: vi.fn(),
  piSessionInteractions: vi.fn(),
  piSessionApproveTool: vi.fn(),
  piSessionAnswerQuestion: vi.fn(),
}));

const SESSION_ID = "pi-session-1";

const choicePayload = (title: string, question = "请选择方向"): AskQuestionPayload => ({
  title,
  questions: [
    {
      id: "q1",
      question,
      type: "single",
      options: [
        { label: "方案 A", value: "A" },
        { label: "方案 B", value: "B" },
      ],
      required: true,
    },
  ],
});

let revision = 0;
/** 宿主推送的提问快照（替换该会话全部等待中的问题） */
const hostQuestions = (...questions: Array<Omit<PiUserQuestionRequest, "sessionId">>) => {
  revision += 1;
  receiveInteractions({
    sessionId: SESSION_ID,
    revision,
    approvals: [],
    questions: questions.map(question => ({ ...question, sessionId: SESSION_ID })),
  });
};

const createExecution = (
  overrides: Partial<ToolCallExecutionState> = {}
): ToolCallExecutionState => ({
  toolCallId: "call-renderer-1",
  toolName: "ask-question",
  status: "executing",
  input: "{}",
  timestamp: Date.now(),
  metadata: { piSessionId: SESSION_ID },
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

const findSubmitButton = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("button")).find(button =>
    button.textContent?.includes("提交答案")
  );

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("AskQuestionRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePiInteractionStore.setState({ sessions: {}, readySessions: {} });
    setInteractionSessionReady(SESSION_ID, true);
  });

  it("输入无法解析时应回退默认渲染", async () => {
    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={createExecution()}
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
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={createExecution({
          status: "pending",
          input: '{"questions":[{"question":"未完成',
        })}
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

  it("提交答案只发往宿主，收下后锁定等待模型继续", async () => {
    const execution = createExecution({ toolCallId: "call-submit" });
    hostQuestions({
      requestId: "req-1",
      toolCallId: execution.toolCallId,
      payload: choicePayload("确认方向"),
      askedAt: 1,
    });
    vi.mocked(piSessionAnswerQuestion).mockResolvedValue({ ok: true });

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(findSubmitButton(container)?.disabled).toBe(false);
    await click(findSubmitButton(container));
    expect(container.textContent).toContain("请先回答：请选择方向");
    expect(piSessionAnswerQuestion).not.toHaveBeenCalled();

    await click(findOptionInput(container, "方案 A"));
    await click(findSubmitButton(container));

    expect(piSessionAnswerQuestion).toHaveBeenCalledWith(SESSION_ID, "req-1", [
      { questionId: "q1", selectedValues: ["A"], otherText: "" },
    ]);
    expect(container.textContent).toContain("答案已提交");
    expect(findSubmitButton(container)?.disabled).toBe(true);

    await unmount(root, container);
  });

  it("宿主拒收（提问已结束）时显示错误并同步最新快照", async () => {
    const execution = createExecution({ toolCallId: "call-stale" });
    const payload = choicePayload("确认方向");
    hostQuestions({
      requestId: "req-stale",
      toolCallId: execution.toolCallId,
      payload,
      askedAt: 1,
    });
    vi.mocked(piSessionAnswerQuestion).mockResolvedValue({ ok: false, error: "提问已结束" });
    vi.mocked(piSessionInteractions).mockResolvedValue({
      ok: true,
      snapshots: [{ sessionId: SESSION_ID, revision: 999, approvals: [], questions: [] }],
    });

    // 真实渲染时 parsedInput 是工具参数：宿主撤掉等待后卡片仍能显示题面
    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={payload}
        renderDefault={() => <div>fallback</div>}
      />
    );
    await click(findOptionInput(container, "方案 B"));
    await click(findSubmitButton(container));

    expect(container.textContent).toContain("提问已结束");
    expect(findSubmitButton(container)?.disabled).toBe(true);

    // 随后宿主的 tool_execution_end 把工具卡归约为失败终态
    await act(async () => {
      root.render(
        <AskQuestionRenderer
          execution={{ ...execution, status: "failed" }}
          isDark={false}
          parsedInput={payload}
          renderDefault={() => <div>fallback</div>}
        />
      );
    });
    expect(container.textContent).toContain("这次没有得到回答");
    expect(findSubmitButton(container)?.disabled).toBe(true);

    await unmount(root, container);
  });

  it("按会话与 toolCallId 定位问题：其它会话的同名调用不串台", async () => {
    const execution = createExecution({ toolCallId: "call-dup" });
    receiveInteractions({
      sessionId: "other-session",
      revision: 1,
      approvals: [],
      questions: [
        {
          requestId: "req-other",
          sessionId: "other-session",
          toolCallId: execution.toolCallId,
          payload: choicePayload("旧问题", "旧对话问题"),
          askedAt: 1,
        },
      ],
    });
    hostQuestions({
      requestId: "req-new",
      toolCallId: execution.toolCallId,
      payload: choicePayload("新问题", "新对话问题"),
      askedAt: 2,
    });

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("新对话问题");
    expect(container.textContent).not.toContain("旧对话问题");

    await unmount(root, container);
  });

  it("宿主没有这条等待（重启后遗留）时只读显示中断，不可提交", async () => {
    const payload = choicePayload("确认方向");
    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={createExecution({ toolCallId: "call-orphan", status: "awaiting-approval" })}
        isDark={false}
        parsedInput={payload}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("对话已中断");
    expect(findSubmitButton(container)?.disabled).toBe(true);

    await unmount(root, container);
  });

  it("会话订阅未就绪时显示恢复中，不开放提交", async () => {
    const execution = createExecution({ toolCallId: "call-restoring" });
    setInteractionSessionReady(SESSION_ID, false);
    hostQuestions({
      requestId: "req-restoring",
      toolCallId: execution.toolCallId,
      payload: choicePayload("确认方向"),
      askedAt: 1,
    });

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={execution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    expect(container.textContent).toContain("正在恢复问题");
    expect(findSubmitButton(container)?.disabled).toBe(true);

    await unmount(root, container);
  });

  it("仅依赖 execution.output 回填已提交答案时不应陷入无限更新", async () => {
    const parsedInput = choicePayload("确认方向");
    const execution = createExecution({
      toolCallId: "call-output-only",
      status: "success",
      output: JSON.stringify(
        buildAskQuestionToolResult(parsedInput, {
          submittedAt: 1234567890,
          answers: [{ questionId: "q1", selectedValues: ["A"], otherText: "" }],
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
    const firstExecution = createExecution({ toolCallId: "call-switch-1" });
    const secondExecution = createExecution({ toolCallId: "call-switch-2" });
    hostQuestions(
      {
        requestId: "req-1",
        toolCallId: firstExecution.toolCallId,
        payload: choicePayload("问题一"),
        askedAt: 1,
      },
      {
        requestId: "req-2",
        toolCallId: secondExecution.toolCallId,
        payload: choicePayload("问题二", "新的问题"),
        askedAt: 2,
      }
    );

    const { root, container } = await mount(
      <AskQuestionRenderer
        execution={firstExecution}
        isDark={false}
        parsedInput={null}
        renderDefault={() => <div>fallback</div>}
      />
    );

    await click(findOptionInput(container, "方案 A"));
    expect(findOptionInput(container, "方案 A")?.checked).toBe(true);
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

    expect(findOptionInput(container, "方案 A")?.checked).toBe(false);
    expect(container.textContent).toContain("问题二");
    expect(container.textContent).toContain("新的问题");

    await unmount(root, container);
  });
});
