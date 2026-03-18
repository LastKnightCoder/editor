import type {
  ToolCallExecutionState,
  ToolCallPayload,
  ToolExecutionResult,
} from "@/types";
import {
  resolveToolExecutionMetadata as resolveGenerativeUiExecutionMetadata,
  upsertStreamingToolExecutions as upsertGenerativeUiStreamingExecutions,
} from "@/generative-ui/streaming-tool-adapter";

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
    upsertStreamingExecutions: upsertGenerativeUiStreamingExecutions,
    resolveExecutionMetadata: resolveGenerativeUiExecutionMetadata,
  },
];

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
  },
};
