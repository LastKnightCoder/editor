/**
 * 扩展的工具交互宿主：审批条与提问卡（@tau/chat-ui，与桌面同一套）从本页对话的等待项里取状态，
 * 经 Tau 的 ai.run.approve / ai.run.answer 提交。等待项随运行事件推来，按 toolCallId 对应到工具行。
 */
import { chatActionErrorText, chatTranslator } from "../chat.i18n";
import type { ToolInteractionHost } from "@tau/chat-ui/conversation";
import type { PageChat } from "./chat";
import { getState, useCompanion } from "./store";

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
    decideApproval: (_execution, request, choice) =>
      chat.approve(request.requestId, choice).catch(error => {
        throw new Error(chatActionErrorText(error), { cause: error });
      }),
    answerQuestion: (_execution, request, answers) =>
      chat.answer(request.requestId, answers).catch(error => {
        throw new Error(chatActionErrorText(error), { cause: error });
      }),
    riskLabel: risk =>
      risk === "read" || risk === "write" || risk === "execute"
        ? chatTranslator.t(`risk.${risk}`)
        : risk,
    get approvalHint() {
      return chatTranslator.t("approval.hint");
    },
  };
}
