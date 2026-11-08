import { useEffect } from "react";
import { AskQuestionRenderer, ToolApprovalBar } from "@tau/chat-ui";
import { ASK_QUESTION_TOOL_NAME } from "@tau/shared/chat-core";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import type { PiSessionInteractionSnapshot } from "@/types/pi-session";
import { setInteractionSessionReady } from "@/services/piInteractions";

/**
 * 子会话的待回答问题与待审批工具：按交互快照拼出工具执行，交给现有提问卡 / 审批条处理，
 * 等待、提交与恢复都仍由 PiSessionInteractions 持有。
 */
export function SubagentInteractions({
  snapshot,
  isDark,
}: {
  snapshot: PiSessionInteractionSnapshot;
  isDark: boolean;
}) {
  // 子宿主已装配工具上下文，可直接处理自己的交互，不依赖父会话仍在生成。
  useEffect(() => {
    setInteractionSessionReady(snapshot.sessionId, true);
  }, [snapshot.sessionId]);
  const metadata = { piSessionId: snapshot.sessionId };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {snapshot.questions.map(question => {
        const execution: ToolCallExecutionState = {
          toolCallId: question.toolCallId,
          toolName: ASK_QUESTION_TOOL_NAME,
          status: "executing",
          input: JSON.stringify(question.payload),
          metadata,
          timestamp: question.askedAt,
        };
        return (
          <AskQuestionRenderer
            key={question.requestId}
            execution={execution}
            isDark={isDark}
            parsedInput={question.payload}
            renderDefault={() => null}
          />
        );
      })}
      {snapshot.approvals.map(approval => {
        const execution: ToolCallExecutionState = {
          toolCallId: approval.toolCallId,
          toolName: approval.toolName,
          status: "awaiting-approval",
          input: approval.input,
          metadata,
          timestamp: approval.requestedAt,
        };
        return (
          <div key={approval.requestId} className="[&>div]:m-0">
            <ToolApprovalBar execution={execution} />
          </div>
        );
      })}
    </div>
  );
}
