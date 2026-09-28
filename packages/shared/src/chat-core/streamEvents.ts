/**
 * 统一流事件与归约器：把「快照语义」的流事件应用到 ResponseMessage，
 * 内部复用 assistantBlocks 的块组装逻辑。
 * 浏览器扩展消费 AI 运行协议 v2 的 `ai.run.event`（aiRunProtocol.ts），桌面主进程的扩展桥用它维护
 * 接回快照；两端禁止再各自手写流式拼块。
 */
import type {
  ModelUsage,
  ProviderMetadata,
  ResponseMessage,
  ToolCallExecutionState,
  ToolCallPayload,
} from "./messages";
import {
  applyAssistantProviderMetadataSnapshot,
  applyAssistantReasoningSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  finalizeAssistantTurn,
} from "./assistantBlocks";

/** turn 内快照事件：fullText / executions 为当前全量，幂等可重放 */
export type ChatStreamTurnEvent =
  | { type: "text"; turnId: string; fullText: string }
  | { type: "reasoning"; turnId: string; fullText: string }
  | {
      type: "tool-calls";
      turnId: string;
      /** 执行状态快照；流式计划阶段可只带 toolCalls */
      executions?: ToolCallExecutionState[];
      toolCalls?: ToolCallPayload[];
    }
  | { type: "turn-finish"; turnId: string }
  | {
      type: "provider-metadata";
      turnId: string;
      metadata: ProviderMetadata;
    };

/** run 级事件 */
export type ChatStreamRunEvent =
  | { type: "usage"; turnId?: string; usage: ModelUsage }
  | {
      type: "run-finish";
      content?: string;
      reasoning?: string;
      error?: string;
    };

export type ChatStreamEvent = ChatStreamTurnEvent | ChatStreamRunEvent;

/**
 * 把流事件应用到助手消息（原地更新并返回同一引用；调用方负责渲染投影时复制）。
 * run-finish / usage 不改变块结构，仅原样返回。
 */
export const applyChatStreamEvent = (
  message: ResponseMessage,
  event: ChatStreamEvent
): ResponseMessage => {
  switch (event.type) {
    case "text":
      applyAssistantTextSnapshot(message, event.turnId, event.fullText);
      return message;
    case "reasoning":
      applyAssistantReasoningSnapshot(message, event.turnId, event.fullText);
      return message;
    case "tool-calls":
      applyAssistantToolCallsSnapshot(
        message,
        event.turnId,
        event.executions ?? [],
        event.toolCalls
      );
      return message;
    case "turn-finish":
      finalizeAssistantTurn(message, event.turnId);
      return message;
    case "provider-metadata":
      applyAssistantProviderMetadataSnapshot(message, event.turnId, event.metadata);
      return message;
    case "usage":
    case "run-finish":
      return message;
  }
};
