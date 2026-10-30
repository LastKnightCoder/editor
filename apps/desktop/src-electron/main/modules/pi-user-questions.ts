import { randomUUID } from "node:crypto";
import type { AgentToolResult, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { PiUserQuestionRequest } from "@/types/pi-session";
import {
  ASK_QUESTION_DESCRIPTION,
  ASK_QUESTION_PARAMETERS,
  ASK_QUESTION_TOOL_NAME,
  buildAskQuestionToolResult,
  findUnansweredQuestion,
  normalizeAskQuestionPayload,
  type AskQuestionAnswerItem,
  type AskQuestionSubmission,
} from "@tau/shared/chat-core";

/** 渲染端提交的答案只取声明过的字段，防止畸形载荷进入工具结果 */
const toSubmission = (answers: unknown): AskQuestionSubmission | null => {
  if (!Array.isArray(answers)) return null;
  const items: AskQuestionAnswerItem[] = [];
  for (const answer of answers) {
    if (!answer || typeof answer !== "object") return null;
    const { questionId, selectedValues, otherText } = answer as Record<string, unknown>;
    if (typeof questionId !== "string") return null;
    items.push({
      questionId,
      selectedValues: Array.isArray(selectedValues)
        ? selectedValues.filter((value): value is string => typeof value === "string")
        : [],
      otherText: typeof otherText === "string" ? otherText.trim() : "",
    });
  }
  return { answers: items, submittedAt: Date.now() };
};

/**
 * 宿主原生 ask-question：提问等待归会话宿主所有，页面切换、渲染层重载都不丢；
 * 渲染端只展示快照并经 IPC 提交答案。只注册给有提问界面的交互会话。
 */
export class PiUserQuestions {
  private readonly pending = new Map<
    string,
    {
      request: PiUserQuestionRequest;
      settle: (outcome: { result: AgentToolResult } | { error: Error }) => void;
    }
  >();
  private disposed = false;

  constructor(
    private readonly options: {
      sessionId: string;
      /** 等待集合变化时通知宿主发布交互快照；通知失败（窗口已关闭）会抛出 */
      onChange: () => void;
    }
  ) {}

  public pendingRequests(): PiUserQuestionRequest[] {
    return [...this.pending.values()].map(item => item.request);
  }

  public toolDefinition(): ToolDefinition {
    return {
      name: ASK_QUESTION_TOOL_NAME,
      label: ASK_QUESTION_TOOL_NAME,
      description: ASK_QUESTION_DESCRIPTION,
      parameters: ASK_QUESTION_PARAMETERS as unknown as ToolDefinition["parameters"],
      execute: (toolCallId, params, signal) => this.ask(toolCallId, params, signal),
    };
  }

  /** execute 挂起直到用户作答；抛错由 pi 转成 isError 工具结果回给模型 */
  public ask(toolCallId: string, params: unknown, signal?: AbortSignal): Promise<AgentToolResult> {
    if (this.disposed) return Promise.reject(new Error("会话已关闭，问题未发出"));
    if (signal?.aborted) return Promise.reject(new Error("提问已中止"));
    const normalized = normalizeAskQuestionPayload(params);
    if (!normalized.payload) {
      return Promise.reject(new Error(normalized.error ?? "ask-question 参数不合法"));
    }
    const request: PiUserQuestionRequest = {
      requestId: randomUUID(),
      sessionId: this.options.sessionId,
      toolCallId,
      payload: normalized.payload,
      askedAt: Date.now(),
    };
    return new Promise<AgentToolResult>((resolve, reject) => {
      const settle = (outcome: { result: AgentToolResult } | { error: Error }) => {
        if (!this.pending.delete(request.requestId)) return;
        signal?.removeEventListener("abort", onAbort);
        try {
          this.options.onChange();
        } catch {
          // 窗口关闭后仍须结束等待，不能让通知失败阻塞会话收尾。
        } finally {
          if ("result" in outcome) resolve(outcome.result);
          else reject(outcome.error);
        }
      };
      const onAbort = () => settle({ error: new Error("提问已中止，用户未作答") });
      this.pending.set(request.requestId, { request, settle });
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        this.options.onChange();
      } catch {
        settle({ error: new Error("提问界面不可用，用户未作答") });
      }
    });
  }

  /** 提交答案：成功返回 undefined，否则返回可展示的错误（等待已结束/答案不完整） */
  public answer(requestId: string, answers: unknown): string | undefined {
    const item = this.pending.get(requestId);
    if (!item) return "提问已结束，请刷新会话状态";
    const submission = toSubmission(answers);
    if (!submission) return "答案格式不正确";
    const missing = findUnansweredQuestion(item.request.payload, submission.answers);
    if (missing) return `请先回答：${missing.question}`;
    const result = buildAskQuestionToolResult(item.request.payload, submission);
    item.settle({
      result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: {} },
    });
    return undefined;
  }

  public dispose(): void {
    this.disposed = true;
    for (const item of this.pending.values()) {
      item.settle({ error: new Error("会话已关闭，问题未得到回答") });
    }
  }
}
