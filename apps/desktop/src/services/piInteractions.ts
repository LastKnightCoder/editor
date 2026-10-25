/**
 * 主进程会话交互快照（工具审批 + 提问）的只读投影：等待、授权与答案收取均由 pi 宿主持有，
 * 这里只保存带版本号的快照，用户操作经 IPC 提交后等宿主推送新快照，不乐观伪造状态。
 */

import { create } from "zustand";
import type {
  PiSessionInteractionSnapshot,
  PiToolApprovalChoice,
  PiToolApprovalRequest,
  PiUserQuestionRequest,
} from "@/types/pi-session";
import type { AskQuestionAnswerItem } from "@tau/shared/chat-core";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { configureToolInteractions, type ToolInteractionHost } from "@tau/chat-ui";
import { RISK_LABEL } from "@/services/tool-permission/mode";
import {
  onPiSessionInteractions,
  piSessionAnswerQuestion,
  piSessionApproveTool,
  piSessionInteractions,
} from "@/commands/piSession";

interface State {
  sessions: Record<string, PiSessionInteractionSnapshot>;
  /** 归约订阅已接好的会话：之前提交的操作可能先于续流监听，界面据此禁用提交 */
  readySessions: Record<string, boolean>;
}

export const usePiInteractionStore = create<State>(() => ({
  sessions: {},
  readySessions: {},
}));

export const setInteractionSessionReady = (sessionId: string, ready: boolean): void => {
  usePiInteractionStore.setState(state => ({
    readySessions: { ...state.readySessions, [sessionId]: ready },
  }));
};

export const receiveInteractions = (snapshot: PiSessionInteractionSnapshot): void => {
  usePiInteractionStore.setState(state => {
    if ((state.sessions[snapshot.sessionId]?.revision ?? -1) >= snapshot.revision) return state;
    return { sessions: { ...state.sessions, [snapshot.sessionId]: snapshot } };
  });
};

export const refreshInteractions = async (): Promise<void> => {
  const result = await piSessionInteractions();
  if (!result.ok) throw new Error(result.error ?? "读取会话交互失败");
  result.snapshots.forEach(receiveInteractions);
};

let initialized = false;
export const initPiInteractions = (): void => {
  if (initialized) return;
  initialized = true;
  configureToolInteractions(desktopToolInteractionHost);
  onPiSessionInteractions(receiveInteractions);
  void refreshInteractions().catch(error => console.error("恢复会话交互失败:", error));
};

export const decideToolApproval = async (
  request: PiToolApprovalRequest,
  choice: PiToolApprovalChoice
): Promise<void> => {
  const result = await piSessionApproveTool(request.sessionId, request.requestId, choice);
  if (!result.ok) {
    await refreshInteractions();
    throw new Error(result.error ?? "提交工具审批失败");
  }
};

export const answerQuestion = async (
  request: PiUserQuestionRequest,
  answers: AskQuestionAnswerItem[]
): Promise<void> => {
  const result = await piSessionAnswerQuestion(request.sessionId, request.requestId, answers);
  if (!result.ok) {
    await refreshInteractions();
    throw new Error(result.error ?? "提交答案失败");
  }
};

const sessionOf = (execution: ToolCallExecutionState) => {
  const sessionId = execution.metadata?.piSessionId;
  return typeof sessionId === "string" ? sessionId : undefined;
};

/** 桌面的工具交互宿主：审批条与提问卡（@tau/chat-ui）按执行上的 piSessionId 读本 store、经 IPC 提交 */
export const desktopToolInteractionHost: ToolInteractionHost = {
  subscribe: listener => usePiInteractionStore.subscribe(listener),
  approvalOf: execution => {
    const sessionId = sessionOf(execution);
    return sessionId
      ? usePiInteractionStore
          .getState()
          .sessions[sessionId]?.approvals.find(item => item.toolCallId === execution.toolCallId)
      : undefined;
  },
  questionOf: execution => {
    const sessionId = sessionOf(execution);
    return sessionId
      ? usePiInteractionStore
          .getState()
          .sessions[sessionId]?.questions.find(item => item.toolCallId === execution.toolCallId)
      : undefined;
  },
  isReady: execution => {
    const sessionId = sessionOf(execution);
    return Boolean(sessionId && usePiInteractionStore.getState().readySessions[sessionId]);
  },
  decideApproval: (_execution, request, choice) =>
    decideToolApproval(request as PiToolApprovalRequest, choice),
  answerQuestion: (_execution, request, answers) =>
    answerQuestion(request as PiUserQuestionRequest, answers),
  riskLabel: risk => RISK_LABEL[risk as keyof typeof RISK_LABEL] ?? risk,
  approvalHint: "可在设置「AI 服务 · 工具权限」里改为自动",
};
