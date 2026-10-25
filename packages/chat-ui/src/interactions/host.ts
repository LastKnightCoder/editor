/**
 * 工具交互宿主：对话里「等用户处理」的两类事——工具审批与 ask-question 提问——的状态与提交由宿主持有
 * （桌面是 pi 会话交互快照，浏览器扩展是经 Tau 推来的运行事件），渲染件只经这里读写。
 *
 * 宿主在启动时调用 configureToolInteractions 登记一次（与工具渲染注册表同为模块级单例）；
 * 未登记时审批条与提问卡只读展示、不可提交。
 */
import { useSyncExternalStore } from "react";
import type { AskQuestionAnswerItem, AskQuestionPayload } from "@tau/shared/chat-core";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";

export type ToolApprovalChoice = "allow" | "allow-session" | "deny";

export interface PendingToolApproval {
  requestId: string;
  toolName: string;
  risk: string;
  input: string;
}

export interface PendingToolQuestion {
  requestId: string;
  payload: AskQuestionPayload | null;
}

export interface ToolInteractionHost {
  /** 订阅等待项变化（返回取消订阅） */
  subscribe(listener: () => void): () => void;
  /** 这次工具调用正在等的审批；没有返回 undefined */
  approvalOf(execution: ToolCallExecutionState): PendingToolApproval | undefined;
  questionOf(execution: ToolCallExecutionState): PendingToolQuestion | undefined;
  /** 等待项已同步、可以提交（桌面重启恢复期间为 false） */
  isReady(execution: ToolCallExecutionState): boolean;
  decideApproval(
    execution: ToolCallExecutionState,
    request: PendingToolApproval,
    choice: ToolApprovalChoice
  ): Promise<void>;
  answerQuestion(
    execution: ToolCallExecutionState,
    request: PendingToolQuestion,
    answers: AskQuestionAnswerItem[]
  ): Promise<void>;
  /** 风险级别的界面叫法（只读 / 修改内容 / 执行代码） */
  riskLabel(risk: string): string;
  /** 审批条右下角的说明（改为自动的入口在哪） */
  approvalHint?: string;
}

let host: ToolInteractionHost | null = null;
const listeners = new Set<() => void>();

export function configureToolInteractions(next: ToolInteractionHost | null): void {
  host = next;
  listeners.forEach(listener => listener());
}

export const getToolInteractionHost = () => host;

const subscribeHost = (listener: () => void) => {
  listeners.add(listener);
  const unsubscribe = host?.subscribe(listener);
  return () => {
    listeners.delete(listener);
    unsubscribe?.();
  };
};

/** 读这次工具调用的等待项；宿主状态或登记变化时重渲染 */
export function useToolInteraction<T>(
  execution: ToolCallExecutionState,
  select: (host: ToolInteractionHost, execution: ToolCallExecutionState) => T,
  fallback: T
): T {
  return useSyncExternalStore(
    subscribeHost,
    () => (host ? select(host, execution) : fallback),
    () => fallback
  );
}
