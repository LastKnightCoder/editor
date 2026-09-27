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
import type { AskQuestionAnswerItem } from "@/tools/askQuestionTypes";
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
