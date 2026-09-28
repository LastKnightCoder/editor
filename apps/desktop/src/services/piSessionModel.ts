/**
 * pi 会话视图模型与事件归约器（M2 渲染层核心，后续 ChatContainer 重写与浏览器插件共用）。
 * 直接围绕 pi-coding-agent 的 AgentSessionEvent 形状：message_update 自带 partial
 * （完整 AssistantMessage 快照），归约取快照即可——天然幂等可重放，无需拼 delta。
 * 用户消息由发送方本地插入（appendUserMessage）。
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export interface PiToolExecutionVM {
  toolCallId: string;
  toolName: string;
  argsPreview: string;
  status: "running" | "done" | "error";
  outputPreview?: string;
}

export interface PiAssistantMessageVM {
  kind: "assistant";
  seq: number;
  /** 取自 message 事件的 content 快照（text/thinking/toolCall 块按序） */
  content: Array<Record<string, unknown>>;
  streaming: boolean;
  stopReason?: string;
  errorMessage?: string;
}

export interface PiUserMessageVM {
  kind: "user";
  seq: number;
  text: string;
}

export interface PiToolResultVM {
  kind: "toolResult";
  seq: number;
  toolCallId: string;
  toolName: string;
  isError: boolean;
  contentText: string;
}

export type PiTranscriptItem = PiUserMessageVM | PiAssistantMessageVM | PiToolResultVM;

export interface PiSessionVM {
  status: "idle" | "streaming";
  transcript: PiTranscriptItem[];
  executions: PiToolExecutionVM[];
  retrying: { attempt: number; maxAttempts: number } | null;
  /** steer/followUp 排队中的输入（流式中插话） */
  queuedInput: { steering: string[]; followUp: string[] };
  lastError?: string;
}

export const createInitialSessionVM = (): PiSessionVM => ({
  status: "idle",
  transcript: [],
  executions: [],
  retrying: null,
  queuedInput: { steering: [], followUp: [] },
});

export interface PiSessionReducer {
  state: PiSessionVM;
  appendUserMessage(text: string): void;
  process(event: AgentSessionEvent): void;
}

const previewOf = (value: unknown): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
};

const contentTextOf = (content: Array<Record<string, unknown>>): string =>
  content
    .filter(block => block.type === "text")
    .map(block => String(block.text ?? ""))
    .join("");

const isAssistant = (
  message: unknown
): message is {
  role: "assistant";
  content: Array<Record<string, unknown>>;
  stopReason?: string;
  errorMessage?: string;
} => {
  return (message as { role?: string }).role === "assistant";
};

export function createPiSessionReducer(
  initial: PiSessionVM = createInitialSessionVM()
): PiSessionReducer {
  const state = initial;
  let nextSeq = state.transcript.reduce((max, item) => Math.max(max, item.seq), 0) + 1;

  return {
    state,
    appendUserMessage(text) {
      state.transcript.push({ kind: "user", seq: nextSeq++, text });
    },
    process(event) {
      switch (event.type) {
        case "agent_start":
          state.status = "streaming";
          break;
        case "message_start":
          if (!isAssistant(event.message)) break;
          state.transcript.push({
            kind: "assistant",
            seq: nextSeq++,
            content: (event.message.content ?? []) as Array<Record<string, unknown>>,
            streaming: true,
          });
          break;
        case "message_update": {
          if (!isAssistant(event.message)) break;
          const last = [...state.transcript]
            .reverse()
            .find(item => item.kind === "assistant" && item.streaming);
          if (last && last.kind === "assistant") {
            last.content = (event.message.content ?? []) as Array<Record<string, unknown>>;
          }
          break;
        }
        case "message_end": {
          if (!isAssistant(event.message)) break;
          const last = [...state.transcript].reverse().find(item => item.kind === "assistant");
          if (last && last.kind === "assistant") {
            last.streaming = false;
            last.content = (event.message.content ?? []) as Array<Record<string, unknown>>;
            last.stopReason = event.message.stopReason;
            if (event.message.stopReason === "error") {
              state.lastError = event.message.errorMessage ?? "模型返回错误";
            }
          }
          break;
        }
        case "turn_end":
          for (const result of event.toolResults ?? []) {
            state.transcript.push({
              kind: "toolResult",
              seq: nextSeq++,
              toolCallId: result.toolCallId,
              toolName: result.toolName,
              isError: result.isError === true,
              contentText: previewOf(
                (result.content ?? [])
                  .map((block: { type?: string; text?: string }) =>
                    block.type === "text" ? block.text : ""
                  )
                  .join("")
              ),
            });
          }
          break;
        case "tool_execution_start":
          state.executions.push({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            argsPreview: previewOf(event.args),
            status: "running",
          });
          break;
        case "tool_execution_update": {
          const run = state.executions.find(e => e.toolCallId === event.toolCallId);
          if (run && event.partialResult != null)
            run.outputPreview = previewOf(event.partialResult);
          break;
        }
        case "tool_execution_end": {
          const run = state.executions.find(e => e.toolCallId === event.toolCallId);
          if (run) {
            run.status = event.isError ? "error" : "done";
            const text = (event.result?.content ?? [])
              .map((block: { type?: string; text?: string }) =>
                block.type === "text" ? block.text : ""
              )
              .join("");
            if (text) run.outputPreview = previewOf(text);
          }
          break;
        }
        case "auto_retry_start":
          state.retrying = { attempt: event.attempt, maxAttempts: event.maxAttempts };
          break;
        case "auto_retry_end":
          state.retrying = null;
          if (event.success === false && event.finalError) state.lastError = event.finalError;
          break;
        case "queue_update":
          state.queuedInput = { steering: [...event.steering], followUp: [...event.followUp] };
          break;
        case "agent_settled":
          state.status = "idle";
          state.retrying = null;
          break;
        default:
          break;
      }
    },
  };
}

/** 便捷取最终文本（标题生成等消费方） */
export const assistantTextOf = (vm: PiSessionVM): string => {
  const last = [...vm.transcript].reverse().find(item => item.kind === "assistant");
  return last && last.kind === "assistant" ? contentTextOf(last.content) : "";
};
