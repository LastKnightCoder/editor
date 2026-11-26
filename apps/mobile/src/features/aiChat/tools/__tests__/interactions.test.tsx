import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { configureToolInteractions, type ToolInteractionHost } from "@tau/chat-ui/conversation";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { mobileLocaleSource } from "../../../../services/i18n";
import { toolT } from "../../tools.binding";
import { ApprovalCard } from "../ApprovalCard";
import { QuestionCard } from "../QuestionCard";

const reads = vi.hoisted(() => ({
  groups: vi.fn(async () => [{ id: 19, title: "待办清单", isArchived: false, isSystem: false }]),
}));
vi.mock("../../../../services/tauri", async original => ({
  ...(await original<object>()),
  todoListGroups: reads.groups,
}));

const approval = {
  requestId: "approval-id",
  toolName: "create_todo",
  risk: "write",
  input: '{"title":"用户原始待办","groupId":"19","dueAt":"2026-12-01"}',
};
const question = {
  requestId: "question-id",
  payload: {
    title: "原始提问标题",
    submitLabel: "用户定义提交",
    questions: [
      {
        id: "first-id",
        question: "第一题原文",
        type: "single" as const,
        required: true,
        options: [{ value: "raw-a", label: "原始选项 A" }],
      },
      {
        id: "second-id",
        question: "第二题原文",
        type: "multiple" as const,
        required: false,
        options: [{ value: "raw-b", label: "原始选项 B" }],
      },
    ],
  },
};
const decide = vi.fn<ToolInteractionHost["decideApproval"]>();
const answer = vi.fn<ToolInteractionHost["answerQuestion"]>();
const transport: ToolInteractionHost = {
  subscribe: () => () => undefined,
  approvalOf: execution => (execution.toolName === approval.toolName ? approval : undefined),
  questionOf: execution => (execution.toolName === "ask-question" ? question : undefined),
  isReady: () => true,
  decideApproval: decide,
  answerQuestion: answer,
  riskLabel: risk => risk,
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  configureToolInteractions(transport);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  configureToolInteractions(null);
  await act(async () => mobileLocaleSource.setLocale("zh-CN"));
  vi.useRealTimers();
});
const execution = (toolName: string): ToolCallExecutionState => ({
  toolCallId: "raw-call-id",
  toolName,
  status: "awaiting-approval",
  input: "{}",
  timestamp: 1,
});
const button = (label: string) =>
  [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === label);
const click = async (element: HTMLElement | undefined | null) => {
  if (!element) throw new Error("missing action");
  await act(async () => element.click());
};

it("审批换语保留字段节点和在途请求，等待宿主时不重复授权或读取预览", async () => {
  let finish!: () => void;
  decide.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const item = execution(approval.toolName);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ApprovalCard execution={item} />
      </QueryClientProvider>
    )
  );
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect([...host.querySelectorAll("span")].some(node => node.textContent === "待办清单")).toBe(
    true
  );
  const title = [...host.querySelectorAll("span")].find(
    node => node.textContent === "用户原始待办"
  );
  const allow = button(toolT("approval.allow"));
  if (!allow) throw new Error("missing approval action");
  await click(allow);
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(button(toolT("approval.allow"))).toBe(allow);
    expect(allow.disabled).toBe(true);
    expect(
      [...host.querySelectorAll("span")].find(node => node.textContent === "用户原始待办")
    ).toBe(title);
    expect(reads.groups).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledWith(item, approval, "allow");
    expect(transport.approvalOf(item)).toBe(approval);
  }
  await act(async () => finish());
  expect(allow.disabled).toBe(false);
});

it("提问换语保留分页、选项、其他回答与选区，在途提交保持原字段身份", async () => {
  let finish!: () => void;
  answer.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const item = execution("ask-question");
  await act(async () => root.render(<QuestionCard execution={item} />));
  await click(button(toolT("question.next")));
  const alert = host.querySelector('[role="alert"]');
  const originalError = alert?.textContent;
  await act(async () => mobileLocaleSource.setLocale("en-US"));
  expect(host.querySelector('[role="alert"]')).toBe(alert);
  expect(alert?.textContent).not.toBe(originalError);
  const first = host.querySelector<HTMLButtonElement>('[role="radio"]');
  await click(first);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await click(button(toolT("question.next")));
  const second = host.querySelector<HTMLButtonElement>('[role="checkbox"]');
  await click(second);
  await click(button(toolT("question.other")));
  const input = host.querySelector("input");
  if (!input) throw new Error("missing other answer");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setValue) throw new Error("missing native input setter");
  await act(async () => {
    setValue.call(input, " 用户的其他回答 ");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  input.focus();
  input.setSelectionRange(2, 5);
  for (const locale of ["zh-TW", "en-US"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe(" 用户的其他回答 ");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
    expect(second?.getAttribute("aria-checked")).toBe("true");
    expect(answer).not.toHaveBeenCalled();
  }
  await click(button(toolT("question.previous")));
  expect(host.querySelector('[role="radio"]')?.getAttribute("aria-checked")).toBe("true");
  await click(button(toolT("question.next")));
  expect(host.querySelector("input")?.value).toBe(" 用户的其他回答 ");
  const submit = button(question.payload.submitLabel);
  await click(submit);
  await act(async () => mobileLocaleSource.setLocale("zh-TW"));
  expect(submit?.disabled).toBe(true);
  expect(host.querySelector("input")?.disabled).toBe(true);
  expect(answer).toHaveBeenCalledTimes(1);
  expect(answer).toHaveBeenCalledWith(item, question, [
    { questionId: "first-id", selectedValues: ["raw-a"], otherText: "" },
    { questionId: "second-id", selectedValues: ["raw-b"], otherText: "用户的其他回答" },
  ]);
  await act(async () => finish());
  expect(host.querySelector("input")).toBeNull();
});
