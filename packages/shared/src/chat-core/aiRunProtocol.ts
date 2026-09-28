/**
 * 浏览器扩展 ↔ 桌面的 AI 运行协议 v2（M5）。取代 v1 的 `ai.chat` 请求 + `ai.stream.*` 快照通知。
 *
 * 一次运行 = 一个 runId：
 * - `ai.run.start`（请求）立即返回 `{ runId }`，不等回答结束；
 * - 过程经 `ai.run.event` 通知推送（按 runId 路由，`seq` 单调递增，接收端据此丢弃乱序/重复）；
 * - 最后一条一定是 `settled`（成功、失败、被停止都会有），接收端据此收尾；
 * - `ai.run.abort` 停止；`ai.run.state` 查某个扩展对话此刻是否在跑（侧栏重开后接上）。
 *
 * 事件是快照语义，与 v1 相同的块组装（applyChatStreamEvent）可以直接消费 text/reasoning/tool-calls；
 * v1 丢掉的 usage、重试、错误、交互（审批/提问）在 v2 里都有。
 */
import type { ModelUsage, ToolCallExecutionState, ToolCallPayload } from "./messages";

/** 审批：模型要执行需要确认的工具 */
export interface AiRunApprovalRequest {
  requestId: string;
  toolCallId: string;
  toolName: string;
  risk: string;
  input: string;
  requestedAt: number;
}

/** 提问：宿主原生 ask-question，payload 为已归一化的问题结构 */
export interface AiRunQuestionRequest {
  requestId: string;
  toolCallId: string;
  payload: unknown;
  askedAt: number;
}

export type AiRunEvent =
  | { type: "text"; turnId: string; fullText: string }
  | { type: "reasoning"; turnId: string; fullText: string }
  | {
      type: "tool-calls";
      turnId: string;
      executions: ToolCallExecutionState[];
      toolCalls?: ToolCallPayload[];
    }
  | { type: "turn-finish"; turnId: string }
  | { type: "usage"; turnId: string; usage: ModelUsage }
  /** 自动重试中（null = 重试等待结束） */
  | { type: "retry"; status: { attempt: number; maxAttempts: number; delayMs: number } | null }
  /** 模型或运行报错（不一定终止：重试可能接着成功；终止与否看 settled） */
  | { type: "error"; message: string }
  /** 待用户处理的交互快照（审批 + 提问），为空表示没有在等 */
  | { type: "interactions"; approvals: AiRunApprovalRequest[]; questions: AiRunQuestionRequest[] }
  /** 运行结束（唯一终态）：ok=false 时带 error；aborted 表示用户停止 */
  | { type: "settled"; ok: boolean; aborted: boolean; error?: string; lastText: string };

export interface AiRunEventNotification {
  runId: string;
  seq: number;
  event: AiRunEvent;
}

export interface AiRunStartParams {
  /** 客户端生成（接收端先订阅再发起，避免漏掉最早的事件） */
  runId: string;
  /**
   * 持久对话（侧栏）：只带本轮的用户消息，历史由桌面从页面会话文件恢复。
   * 一次性调用（概览页、行内问答）：带全量历史，最后一条为 user。
   */
  messages: Array<{ role: string; content: unknown; [key: string]: unknown }>;
  session?: { id: string; pageUrl: string };
  systemPrompt?: string;
  pageContext?: { url: string; title: string; content?: string };
  /** false = 纯文本单发（行内问答） */
  enableTools?: boolean;
  /** 扩展本地执行的页面工具（OpenAI function 形状） */
  browserTools?: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }>;
  thinkingLevel?: string;
  feature?: string;
}

export interface AiRunStateResult {
  running: boolean;
  runId?: string;
}

export const AI_RUN_METHODS = {
  start: "ai.run.start",
  abort: "ai.run.abort",
  state: "ai.run.state",
  approve: "ai.run.approve",
  answer: "ai.run.answer",
  event: "ai.run.event",
} as const;

/** 按 runId 收事件：丢弃乱序与重复（seq 不大于已收到的） */
export const createRunEventFilter = (runId: string) => {
  let lastSeq = -1;
  return (notification: AiRunEventNotification): AiRunEvent | null => {
    if (notification.runId !== runId || notification.seq <= lastSeq) return null;
    lastSeq = notification.seq;
    return notification.event;
  };
};
