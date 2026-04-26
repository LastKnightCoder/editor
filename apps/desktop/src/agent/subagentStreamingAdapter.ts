import type { ToolCallExecutionState, ToolCallPayload } from "@/types";
import { SUBAGENT_RESEARCH_TOOL_NAME } from "./subagentResearch";
import { buildSubAgentResearchMetadataFromInput } from "@/tools/subagentTool";

const mergeMetadata = (
  currentMetadata?: Record<string, unknown>,
  nextMetadata?: Record<string, unknown>,
) => {
  if (!currentMetadata) {
    return nextMetadata;
  }
  if (!nextMetadata) {
    return currentMetadata;
  }
  return {
    ...currentMetadata,
    ...nextMetadata,
  };
};

export const upsertSubAgentStreamingExecutions = (
  currentExecutions: ToolCallExecutionState[],
  toolCalls: ToolCallPayload[],
  phase: "pending" | "streaming" | "preview" | "error",
): ToolCallExecutionState[] => {
  const nextExecutions = [...currentExecutions];

  for (const call of toolCalls) {
    if (call.function.name !== SUBAGENT_RESEARCH_TOOL_NAME) {
      continue;
    }

    const existingIndex = nextExecutions.findIndex(
      (execution) => execution.toolCallId === call.id,
    );
    const nextMetadata = buildSubAgentResearchMetadataFromInput(
      call.id,
      call.function.arguments || "",
    );

    if (existingIndex >= 0) {
      const current = nextExecutions[existingIndex];
      nextExecutions[existingIndex] = {
        ...current,
        toolName: call.function.name,
        input: call.function.arguments || "",
        metadata: mergeMetadata(current.metadata, nextMetadata),
      };
      continue;
    }

    const status = phase === "error" ? "failed" : "pending";
    nextExecutions.push({
      toolCallId: call.id,
      toolName: call.function.name,
      status,
      input: call.function.arguments || "",
      timestamp: Date.now(),
      metadata: nextMetadata,
    });
  }

  return nextExecutions;
};

export const resolveSubAgentExecutionMetadata = ({
  currentMetadata,
  execution,
}: {
  currentMetadata?: Record<string, unknown>;
  execution?: { metadata?: Record<string, unknown> } | null;
}) => {
  if (!execution?.metadata) {
    return currentMetadata;
  }
  return mergeMetadata(currentMetadata, execution.metadata);
};
