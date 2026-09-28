/**
 * pi AgentSessionEvent → 扩展协议 v2 的 AiRunEvent（M5）。主进程的浏览器扩展桥与渲染端的
 * 一次性入口共用；纯逻辑，可单测。
 *
 * 块组装复用 PiChatEventReducer（与桌面聊天同一套 turnId / 工具卡归约），v1 丢掉的
 * usage、重试、错误都转发；终态 settled 由调用方在拿到运行结果后发（它知道 ok/aborted）。
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AiRunEvent } from "@tau/shared";
import { PiChatEventReducer } from "./piChatEvents";
import type { PiSessionInteractionSnapshot } from "@/types/pi-session";

export interface AiRunEventTranslator {
  handle(event: AgentSessionEvent): void;
  applyInteractions(snapshot: PiSessionInteractionSnapshot): void;
  /** 最后一条回答的正文（settled 里带给一次性入口） */
  lastText(): string;
  /** 本轮出现过的报错（模型报错不一定让 pi 的运行失败，settled 据此判定） */
  lastError(): string | undefined;
}

export function createAiRunEventTranslator(
  emit: (event: AiRunEvent) => void,
  sessionId?: string
): AiRunEventTranslator {
  let latestText = "";
  let latestError: string | undefined;
  const reducer = new PiChatEventReducer(
    {
      applyText: (turnId, text) => {
        latestText = text;
        emit({ type: "text", turnId, fullText: text });
      },
      applyReasoning: (turnId, text) => emit({ type: "reasoning", turnId, fullText: text }),
      applyToolCalls: (turnId, executions, toolCalls) =>
        emit({
          type: "tool-calls",
          turnId,
          executions,
          ...(toolCalls ? { toolCalls } : {}),
        }),
      finalizeTurn: () => {},
      applyUsage: (usage, turnId) => emit({ type: "usage", turnId, usage }),
      onAssistantTurnEnd: ({ turnId }) => emit({ type: "turn-finish", turnId }),
      onRetryStatus: status => emit({ type: "retry", status }),
      onStreamError: message => {
        latestError = message;
        emit({ type: "error", message });
      },
      onSettled: () => {},
    },
    sessionId
  );
  return {
    handle: event => {
      // 新一轮回答开始：清掉上一段正文与报错（重试成功后不该再按失败收尾）
      if (event.type === "agent_start") {
        latestText = "";
        latestError = undefined;
      }
      if (event.type === "auto_retry_start") latestError = undefined;
      reducer.handle(event);
    },
    applyInteractions: snapshot => {
      reducer.applyInteractions(snapshot);
      emit({
        type: "interactions",
        approvals: snapshot.approvals.map(request => ({
          requestId: request.requestId,
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          risk: request.risk,
          input: request.input,
          requestedAt: request.requestedAt,
        })),
        questions: snapshot.questions.map(request => ({
          requestId: request.requestId,
          toolCallId: request.toolCallId,
          payload: request.payload,
          askedAt: request.askedAt,
        })),
      });
    },
    lastText: () => latestText,
    lastError: () => latestError,
  };
}
