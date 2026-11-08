import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { SubagentDetail } from "@/types/subagent";
import type { PiSessionInteractionSnapshot } from "@/types/pi-session";
import type { ResponseMessage } from "@/types";
import { Role } from "@/constants";
import { PiChatEventReducer } from "@/services/piChatEvents";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  createAssistantMessage,
  finalizeAssistantTurn,
} from "@/services/assistantMessageBlocks";

/** 历史、当前响应与用户交互均使用同一聊天归约器投影。 */
export function subagentMessages(
  detail: SubagentDetail,
  interactions?: PiSessionInteractionSnapshot
) {
  const messages = structuredClone(detail.messages);
  const active = detail.view.runs.some(run => run.status === "running");
  if (!active) return messages;
  if (messages.at(-1)?.role !== Role.Assistant) messages.push(createAssistantMessage());
  const assistant = messages.at(-1) as ResponseMessage;
  const noop = () => undefined;
  const reducer = new PiChatEventReducer(
    {
      applyText: (id, text) => applyAssistantTextSnapshot(assistant, id, text),
      applyReasoning: (id, text) => applyAssistantReasoningSnapshot(assistant, id, text),
      applyToolCalls: (id, executions, calls) =>
        applyAssistantToolCallsSnapshot(assistant, id, executions, calls),
      finalizeTurn: id => finalizeAssistantTurn(assistant, id),
      applyUsage: noop,
      onAssistantTurnEnd: noop,
      onRetryStatus: noop,
      onStreamError: noop,
      onSettled: noop,
    },
    detail.view.hostId
  );
  reducer.restoreToolExecutions(assistant);
  if (detail.streamingMessage) {
    const message = detail.streamingMessage as Extract<
      AgentSessionEvent,
      { type: "message_end" }
    >["message"];
    reducer.handle({ type: "message_start", message });
    reducer.handle({ type: "message_end", message });
  }
  if (interactions) reducer.applyInteractions(interactions);
  return messages;
}
