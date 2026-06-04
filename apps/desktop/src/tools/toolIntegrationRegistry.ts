import type {
  ToolCallExecutionState,
  ToolCallPayload,
  ToolExecutionResult,
} from "@/types";
import {
  resolveSubAgentExecutionMetadata,
  upsertSubAgentStreamingExecutions,
} from "@/agent/subagentStreamingAdapter";

export interface ToolStreamingIntegration {
  upsertStreamingExecutions?: (
    currentExecutions: ToolCallExecutionState[],
    toolCalls: ToolCallPayload[],
    phase: "pending" | "streaming" | "preview" | "error",
  ) => ToolCallExecutionState[];
  resolveExecutionMetadata?: (params: {
    toolName: string;
    currentMetadata?: Record<string, unknown>;
    execution?: ToolExecutionResult | null;
  }) => Record<string, unknown> | undefined;
}

const integrations: ToolStreamingIntegration[] = [
  {
    upsertStreamingExecutions: upsertSubAgentStreamingExecutions,
    resolveExecutionMetadata: resolveSubAgentExecutionMetadata,
  },
];

const resolveExecutionMetadata = (params: {
  toolName: string;
  currentMetadata?: Record<string, unknown>;
  execution?: ToolExecutionResult | null;
}): Record<string, unknown> | undefined => {
  let nextMetadata = params.currentMetadata;

  for (const integration of integrations) {
    if (!integration.resolveExecutionMetadata) {
      continue;
    }
    nextMetadata = integration.resolveExecutionMetadata({
      ...params,
      currentMetadata: nextMetadata,
    });
  }

  return nextMetadata;
};

export const toolIntegrationRegistry = {
  upsertStreamingExecutions(
    currentExecutions: ToolCallExecutionState[],
    toolCalls: ToolCallPayload[],
    phase: "pending" | "streaming" | "preview" | "error",
  ): ToolCallExecutionState[] {
    return integrations.reduce((executions, integration) => {
      if (!integration.upsertStreamingExecutions) {
        return executions;
      }
      return integration.upsertStreamingExecutions(
        executions,
        toolCalls,
        phase,
      );
    }, currentExecutions);
  },

  resolveExecutionMetadata(params: {
    toolName: string;
    currentMetadata?: Record<string, unknown>;
    execution?: ToolExecutionResult | null;
  }): Record<string, unknown> | undefined {
    return resolveExecutionMetadata(params);
  },

  reconcileExecutionState(
    previous: ToolCallExecutionState | undefined,
    next: ToolCallExecutionState,
  ): ToolCallExecutionState {
    return {
      ...next,
      metadata: resolveExecutionMetadata({
        toolName: next.toolName,
        currentMetadata: previous?.metadata,
        execution: {
          content: next.output || next.error || "",
          metadata: next.metadata,
          isParameterError: next.errorType === "parameter",
          isCancelled: next.status === "cancelled",
        },
      }),
    };
  },
};
