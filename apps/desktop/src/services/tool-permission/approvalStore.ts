/**
 * 工具确认队列：agent 策略在执行前挂起一个待确认项，对话里的工具行渲染确认条并回填决定。
 * 「本会话始终允许」按会话（conversationKey）+ 工具名记忆，只存内存、重启即失效。
 */

import { create } from "zustand";
import type { AgentToolAuthorizationDecision } from "@tau/agent";
import { createAbortError } from "@tau/agent";
import type { ToolRisk } from "@/types/tool";

export type ToolApprovalChoice = "allow" | "allow-session" | "deny";

export interface PendingToolApproval {
  toolCallId: string;
  toolName: string;
  risk: ToolRisk;
  input: string;
  conversationKey?: string;
  requestedAt: number;
}

interface State {
  pending: Record<string, PendingToolApproval>;
  /** conversationKey → 已「本会话始终允许」的工具名 */
  sessionAllowed: Record<string, string[]>;
}

const resolvers = new Map<string, (decision: AgentToolAuthorizationDecision) => void>();

const GLOBAL_SESSION = "__global__";

export const useToolApprovalStore = create<State>(() => ({
  pending: {},
  sessionAllowed: {},
}));

export const isSessionAllowed = (conversationKey: string | undefined, toolName: string): boolean =>
  (
    useToolApprovalStore.getState().sessionAllowed[conversationKey ?? GLOBAL_SESSION] ?? []
  ).includes(toolName);

const removePending = (toolCallId: string) => {
  resolvers.delete(toolCallId);
  useToolApprovalStore.setState(state => {
    const { [toolCallId]: _removed, ...rest } = state.pending;
    return { pending: rest };
  });
};

/** 挂起一次确认；signal 中止时以 AbortError 拒绝（agent 据此结束整轮） */
export const requestToolApproval = (
  request: Omit<PendingToolApproval, "requestedAt">,
  signal?: AbortSignal
): Promise<AgentToolAuthorizationDecision> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const onAbort = () => {
      removePending(request.toolCallId);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    resolvers.set(request.toolCallId, decision => {
      signal?.removeEventListener("abort", onAbort);
      resolve(decision);
    });
    useToolApprovalStore.setState(state => ({
      pending: { ...state.pending, [request.toolCallId]: { ...request, requestedAt: Date.now() } },
    }));
  });

export const decideToolApproval = (
  toolCallId: string,
  choice: ToolApprovalChoice,
  reason?: string
) => {
  const item = useToolApprovalStore.getState().pending[toolCallId];
  const resolve = resolvers.get(toolCallId);
  if (!item || !resolve) return;
  if (choice === "allow-session") {
    const key = item.conversationKey ?? GLOBAL_SESSION;
    useToolApprovalStore.setState(state => ({
      sessionAllowed: {
        ...state.sessionAllowed,
        [key]: Array.from(new Set([...(state.sessionAllowed[key] ?? []), item.toolName])),
      },
    }));
  }
  removePending(toolCallId);
  resolve(choice === "deny" ? { approved: false, reason } : { approved: true });
};

/** 是否有仍在等待的确认（重启后遗留的 awaiting-approval 执行没有活的等待项） */
export const hasLiveApproval = (toolCallId: string) => resolvers.has(toolCallId);
