/**
 * 主进程审批快照的只读投影；等待与会话授权均由 pi 宿主持有。
 */

import { create } from "zustand";
import type {
  PiToolApprovalChoice,
  PiToolApprovalRequest,
  PiToolApprovalSnapshot,
} from "@/types/pi-session";
import { onPiToolApprovals, piSessionApprovals, piSessionApproveTool } from "@/commands/piSession";

interface State {
  sessions: Record<string, PiToolApprovalSnapshot>;
  readySessions: Record<string, boolean>;
}

export const useToolApprovalStore = create<State>(() => ({
  sessions: {},
  readySessions: {},
}));

/** 先接好归约订阅再允许提交，避免恢复期间审批先于续流监听。 */
export const setApprovalSessionReady = (sessionId: string, ready: boolean): void => {
  useToolApprovalStore.setState(state => ({
    readySessions: { ...state.readySessions, [sessionId]: ready },
  }));
};

export const receiveToolApprovals = (snapshot: PiToolApprovalSnapshot): void => {
  useToolApprovalStore.setState(state => {
    if ((state.sessions[snapshot.sessionId]?.revision ?? -1) >= snapshot.revision) return state;
    return { sessions: { ...state.sessions, [snapshot.sessionId]: snapshot } };
  });
};

export const refreshToolApprovals = async (): Promise<void> => {
  const result = await piSessionApprovals();
  if (!result.ok) throw new Error(result.error ?? "读取工具审批失败");
  result.snapshots.forEach(receiveToolApprovals);
};

let initialized = false;
export const initToolApprovals = (): void => {
  if (initialized) return;
  initialized = true;
  onPiToolApprovals(receiveToolApprovals);
  void refreshToolApprovals().catch(error => console.error("恢复工具审批失败:", error));
};

export const decideToolApproval = async (
  request: PiToolApprovalRequest,
  choice: PiToolApprovalChoice
): Promise<void> => {
  const result = await piSessionApproveTool(request.sessionId, request.requestId, choice);
  if (!result.ok) {
    await refreshToolApprovals();
    throw new Error(result.error ?? "提交工具审批失败");
  }
};
