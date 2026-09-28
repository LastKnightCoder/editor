import { create } from "zustand";
import type { AiRunApprovalRequest, AiRunQuestionRequest } from "@tau/shared";

/**
 * 当前这轮回答里桌面宿主等待用户处理的交互（M5：扩展提问与审批改走桌面宿主原生）。
 * 由侧栏的 SharedChatTab 从 useAiChat 同步进来；工具卡渲染器（提问卡、审批条）按 toolCallId 读，
 * 作答/审批经注册进来的回调发回同一轮运行。宿主是事实源：这里只是它的只读投影。
 */
interface RunInteractionState {
  approvals: AiRunApprovalRequest[];
  questions: AiRunQuestionRequest[];
  answer: ((requestId: string, answers: unknown) => Promise<void>) | null;
  approve:
    ((requestId: string, choice: "allow" | "allow-session" | "deny") => Promise<void>) | null;
}

export const useRunInteractionStore = create<RunInteractionState>(() => ({
  approvals: [],
  questions: [],
  answer: null,
  approve: null,
}));
