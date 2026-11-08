import type { ToolCallExecutionState } from "@/types";

/** 历史调研工具结果的只读展示契约。 */
export const SUBAGENT_RESEARCH_RENDERER_KEY = "subagent-research";

export type SubAgentTaskStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export type SubAgentResearchStatus =
  | "pending"
  | "running"
  | "success"
  | "partial_success"
  | "failed"
  | "cancelled";

export interface SubAgentResearchTask {
  id: string;
  title: string;
  prompt: string;
}

export interface SubAgentResearchEvent {
  time: number;
  type: "started" | "text" | "reasoning" | "tool" | "finished" | "failed" | "cancelled";
  message: string;
}

export interface SubAgentTaskView extends SubAgentResearchTask {
  status: SubAgentTaskStatus;
  startedAt?: number;
  progressText?: string;
  reasoning?: string;
  reasoningPreview?: string;
  toolExecutions: ToolCallExecutionState[];
  events: SubAgentResearchEvent[];
  answer?: string;
  error?: string;
  duration?: number;
}

export interface SubAgentResearchPayload {
  sessionId: string;
  status: SubAgentResearchStatus;
  summary?: string;
  startedAt: number;
  finishedAt?: number;
  tasks: SubAgentTaskView[];
}
