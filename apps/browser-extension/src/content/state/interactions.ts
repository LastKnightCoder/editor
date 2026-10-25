/**
 * 扩展的工具交互宿主：审批条与提问卡（@tau/chat-ui，与桌面同一套）从本页对话的等待项里取状态，
 * 经 Tau 的 ai.run.approve / ai.run.answer 提交。等待项随运行事件推来，按 toolCallId 对应到工具行。
 */
import type { ToolInteractionHost } from "@tau/chat-ui/conversation";
import type { PageChat } from "./chat";
import { getState, useCompanion } from "./store";

const RISK_LABEL: Record<string, string> = {
  read: "只读",
  write: "修改内容",
  execute: "执行代码",
};

export function createInteractionHost(chat: PageChat): ToolInteractionHost {
  return {
    subscribe: listener =>
      useCompanion.subscribe((state, previous) => {
        if (
          state.chat.approvals !== previous.chat.approvals ||
          state.chat.questions !== previous.chat.questions ||
          state.chat.runId !== previous.chat.runId
        )
          listener();
      }),
    approvalOf: execution =>
      getState().chat.approvals.find(item => item.toolCallId === execution.toolCallId),
    questionOf: execution => {
      const question = getState().chat.questions.find(
        item => item.toolCallId === execution.toolCallId
      );
      return question as ReturnType<ToolInteractionHost["questionOf"]>;
    },
    isReady: () => getState().chat.runId !== null,
    decideApproval: (_execution, request, choice) => chat.approve(request.requestId, choice),
    answerQuestion: (_execution, request, answers) => chat.answer(request.requestId, answers),
    riskLabel: risk => RISK_LABEL[risk] ?? risk,
    approvalHint: "可在 Tau 设置「AI 服务 · 工具权限」里改为自动",
  };
}
