import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";

export type DispatchKind = "spawn" | "send";
export const DISPATCH_KIND: Record<string, DispatchKind> = {
  spawn_agent: "spawn",
  send_agent: "send",
};

export const parseJson = (text: string | undefined): Record<string, unknown> | undefined => {
  if (!text) return undefined;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : undefined;
  } catch {
    return undefined;
  }
};

const payloadOf = (value: unknown): Record<string, unknown> | undefined => {
  const render = (value as { render?: { payload?: unknown } } | undefined)?.render;
  return render?.payload && typeof render.payload === "object"
    ? (render.payload as Record<string, unknown>)
    : undefined;
};

/** 身份来自最终输出，同步等待期间来自工具发布的部分结果 */
export const dispatchedAgentId = (execution: ToolCallExecutionState): string | undefined => {
  const partial = execution.metadata?.partial as { details?: unknown } | undefined;
  const candidates = [
    parseJson(execution.output),
    payloadOf(execution.metadata),
    payloadOf(partial?.details),
  ];
  for (const value of candidates) {
    const id = value?.agentId;
    if (typeof id === "string" && id) return id;
  }
  return undefined;
};

export const isSubagentDispatch = (execution: ToolCallExecutionState) =>
  execution.toolName in DISPATCH_KIND;
