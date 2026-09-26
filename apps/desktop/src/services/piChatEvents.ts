/**
 * pi AgentSessionEvent → 桌面 assistant_blocks 快照的映射器（主聊天 pi 会话驱动的渲染端归约）。
 * pi 的 message_update 是 assistant content 的全量快照——与 chat-core 的幂等快照函数
 * （applyAssistant*Snapshot）语义同构，直接映射无需拼 delta。
 * turn 粒度 = pi 的一次 assistant message（工具循环内多次 LLM 调用 = 多 turn）。
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ToolCallPayload, ToolCallExecutionState } from "@/types";
import type { AgentModelUsage } from "@tau/agent";

export interface PiChatEventSink {
  applyText(turnId: string, text: string): void;
  applyReasoning(turnId: string, text: string): void;
  applyToolCalls(
    turnId: string,
    executions: ToolCallExecutionState[],
    toolCalls?: ToolCallPayload[]
  ): void;
  finalizeTurn(turnId: string): void;
  applyUsage(usage: AgentModelUsage, turnId: string): void;
  onAssistantTurnEnd(params: {
    turnId: string;
    finishReason: string | null;
    resultType: "response" | "tool_calls";
  }): void;
  /** pi auto_retry 状态（null = 结束重试等待） */
  onRetryStatus(status: { attempt: number; maxAttempts: number; delayMs: number } | null): void;
  onStreamError(message: string): void;
  /** agent_settled：本轮运行完全沉淀（含重试/压缩结束） */
  onSettled(): void;
  onQueueUpdate(queued: { steering: readonly string[]; followUp: readonly string[] }): void;
}

const contentTextOf = (blocks: Array<{ type: string; text?: string }> | undefined): string =>
  (blocks ?? [])
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n\n");

const contentThinkingOf = (
  blocks: Array<{ type: string; thinking?: string }> | undefined
): string =>
  (blocks ?? [])
    .filter(block => block.type === "thinking")
    .map(block => block.thinking ?? "")
    .join("\n\n");

const resultTextOf = (result: unknown): string => {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n\n");
};

/** turnId 全局递增：同一会话的多轮发送/恢复各自新建 reducer，局部计数会撞 turnId */
let globalTurnCounter = 0;

/** 高频 message_update 快照的发布节流间隔（trailing），避免每 delta 全量 produce+渲染 */
const SNAPSHOT_PUBLISH_INTERVAL_MS = 50;

export class PiChatEventReducer {
  private currentTurnId: string | null = null;
  private readonly executions = new Map<string, ToolCallExecutionState>();
  private readonly executionsByTurn = new Map<string, string[]>();
  private pendingText: string | null = null;
  private pendingReasoning: string | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly sink: PiChatEventSink) {}

  /** 当前会话累计的工具执行快照（含历史 turn） */
  public getExecutions(): ToolCallExecutionState[] {
    return [...this.executions.values()];
  }

  public reset(): void {
    this.currentTurnId = null;
    this.executions.clear();
    this.executionsByTurn.clear();
    this.flushPendingSnapshots();
  }

  /** 立即发布挂起的文本/思考快照（turn 收尾/切换/工具事件前调用，保证终态一致） */
  private flushPendingSnapshots(): void {
    if (this.publishTimer) {
      clearTimeout(this.publishTimer);
      this.publishTimer = null;
    }
    const turnId = this.currentTurnId;
    const text = this.pendingText;
    const reasoning = this.pendingReasoning;
    this.pendingText = null;
    this.pendingReasoning = null;
    if (!turnId) return;
    if (reasoning !== null) this.sink.applyReasoning(turnId, reasoning);
    if (text !== null) this.sink.applyText(turnId, text);
  }

  /** 快照节流：高频事件只保留最新值，trailing 定时发布 */
  private scheduleSnapshotPublish(): void {
    if (this.publishTimer) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      this.flushPendingSnapshots();
    }, SNAPSHOT_PUBLISH_INTERVAL_MS);
  }

  public handle(event: AgentSessionEvent): void {
    switch (event.type) {
      case "message_start": {
        if (event.message.role === "assistant") {
          this.flushPendingSnapshots();
          globalTurnCounter += 1;
          this.currentTurnId = `pi:${globalTurnCounter}`;
        }
        return;
      }
      case "message_update": {
        if (event.message.role !== "assistant" || !this.currentTurnId) return;
        const message = event.message as unknown as {
          content: Array<Record<string, unknown>>;
        };
        const turnId = this.currentTurnId;
        const text = contentTextOf(message.content as never);
        const thinking = contentThinkingOf(message.content as never);
        if (thinking) this.pendingReasoning = thinking;
        if (text) this.pendingText = text;
        // toolCall 块出现在快照里：合成 pending 执行卡（执行事件随后补状态）——工具事件不节流
        const toolCalls: ToolCallPayload[] = message.content
          .filter(block => block.type === "toolCall")
          .map(block => {
            const call = block as { id: string; name: string; arguments: Record<string, unknown> };
            return {
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments ?? {}),
              },
            };
          });
        if (toolCalls.length > 0) {
          this.flushPendingSnapshots();
          this.upsertPendingExecutions(turnId, toolCalls);
          this.sink.applyToolCalls(turnId, this.turnExecutions(turnId), toolCalls);
        } else {
          this.scheduleSnapshotPublish();
        }
        return;
      }
      case "message_end": {
        if (event.message.role !== "assistant" || !this.currentTurnId) return;
        const turnId = this.currentTurnId;
        this.currentTurnId = null;
        const message = event.message as unknown as {
          content: Array<Record<string, unknown>>;
          usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
          stopReason?: string;
          errorMessage?: string;
        };
        // 终态快照直发（不经节流，丢弃 pending 状态）
        this.pendingText = null;
        this.pendingReasoning = null;
        if (this.publishTimer) {
          clearTimeout(this.publishTimer);
          this.publishTimer = null;
        }
        const text = contentTextOf(message.content as never);
        const thinking = contentThinkingOf(message.content as never);
        if (thinking) this.sink.applyReasoning(turnId, thinking);
        if (text) this.sink.applyText(turnId, text);
        const hadToolCalls = message.content.some(block => block.type === "toolCall");
        if (message.usage) {
          this.sink.applyUsage(
            {
              inputTokens: message.usage.input,
              outputTokens: message.usage.output,
              cacheReadTokens: message.usage.cacheRead,
              cacheWriteTokens: message.usage.cacheWrite,
            },
            turnId
          );
        }
        this.sink.finalizeTurn(turnId);
        this.sink.onAssistantTurnEnd({
          turnId,
          finishReason: message.stopReason ?? "stop",
          resultType: hadToolCalls ? "tool_calls" : "response",
        });
        // 用户主动停止（stopReason=aborted）不算错误——避免"停止后闪一下错误"
        if (message.errorMessage && message.stopReason !== "aborted") {
          this.sink.onStreamError(message.errorMessage);
        }
        return;
      }
      case "turn_end": {
        // toolResults 兜底：tool_execution_end 未覆盖时（内置工具路径差异）补齐状态
        for (const toolResult of event.toolResults) {
          const existing = this.executions.get(toolResult.toolCallId);
          if (existing && existing.status !== "executing" && existing.status !== "pending")
            continue;
          this.executions.set(toolResult.toolCallId, {
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
            status: toolResult.isError ? "failed" : "success",
            input: existing?.input ?? "",
            output: contentTextOf(toolResult.content as never) || undefined,
            timestamp: existing?.timestamp ?? Date.now(),
            ...(existing?.duration !== undefined ? { duration: existing.duration } : {}),
          });
        }
        return;
      }
      case "tool_execution_start": {
        const { toolCallId, toolName, args } = event;
        const existing = this.executions.get(toolCallId);
        this.executions.set(toolCallId, {
          toolCallId,
          toolName,
          status: "executing",
          input: args === undefined ? (existing?.input ?? "") : JSON.stringify(args),
          timestamp: existing?.timestamp ?? Date.now(),
        });
        this.publishTurnExecutions(toolCallId);
        return;
      }
      case "tool_execution_update": {
        const execution = this.executions.get(event.toolCallId);
        if (!execution) return;
        const partial = event.partialResult;
        this.executions.set(event.toolCallId, {
          ...execution,
          ...(partial !== undefined
            ? { metadata: { ...(execution.metadata ?? {}), partial } }
            : {}),
        });
        this.publishTurnExecutions(event.toolCallId);
        return;
      }
      case "tool_execution_end": {
        const execution = this.executions.get(event.toolCallId);
        const output = resultTextOf(event.result);
        const details =
          event.result && typeof event.result === "object"
            ? (event.result as { details?: unknown }).details
            : undefined;
        const metadata =
          details && typeof details === "object"
            ? (details as Record<string, unknown>)
            : execution?.metadata;
        const timestamp = execution?.timestamp ?? Date.now();
        this.executions.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: event.isError ? "failed" : "success",
          input: execution?.input ?? "",
          ...(output ? { output } : {}),
          ...(metadata ? { metadata } : {}),
          timestamp,
          ...(execution ? { duration: Date.now() - timestamp } : {}),
          ...(event.isError && !output ? { error: "工具执行失败" } : {}),
        });
        this.publishTurnExecutions(event.toolCallId);
        return;
      }
      case "auto_retry_start": {
        this.sink.onRetryStatus({
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
        });
        return;
      }
      case "auto_retry_end": {
        this.sink.onRetryStatus(null);
        if (!event.success && event.finalError) {
          this.sink.onStreamError(event.finalError);
        }
        return;
      }
      case "queue_update": {
        this.sink.onQueueUpdate({ steering: event.steering, followUp: event.followUp });
        return;
      }
      case "agent_settled": {
        this.sink.onSettled();
        return;
      }
      default:
        return;
    }
  }

  private upsertPendingExecutions(turnId: string, toolCalls: ToolCallPayload[]): void {
    const turnIds = this.executionsByTurn.get(turnId) ?? [];
    for (const call of toolCalls) {
      if (!this.executions.has(call.id)) {
        this.executions.set(call.id, {
          toolCallId: call.id,
          toolName: call.function.name,
          status: "pending",
          input: call.function.arguments || "",
          timestamp: Date.now(),
        });
        turnIds.push(call.id);
      }
    }
    this.executionsByTurn.set(turnId, turnIds);
  }

  private turnExecutions(turnId: string): ToolCallExecutionState[] {
    const ids = this.executionsByTurn.get(turnId) ?? [];
    return ids.map(id => this.executions.get(id)!).filter(Boolean);
  }

  private publishTurnExecutions(toolCallId: string): void {
    for (const [turnId, ids] of this.executionsByTurn) {
      if (ids.includes(toolCallId)) {
        this.sink.applyToolCalls(turnId, this.turnExecutions(turnId));
        return;
      }
    }
  }
}
