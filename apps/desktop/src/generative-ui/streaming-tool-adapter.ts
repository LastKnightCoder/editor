import type {
  ToolCallExecutionState,
  ToolCallPayload,
  ToolExecutionResult,
} from "@/types";
import { SHOW_WIDGET_TOOL_NAME } from "./constants";
import { extractPartialShowWidgetArgs } from "./partial-show-widget-parser";
import {
  buildGenerativeWidgetMetadata,
  buildGenerativeWidgetPayload,
  type GenerativeWidgetWarningCode,
} from "./widget-render-payload";

const mergeExecutionMetadata = (
  currentMetadata?: Record<string, unknown>,
  nextMetadata?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (!currentMetadata && !nextMetadata) {
    return undefined;
  }
  if (!currentMetadata) {
    return nextMetadata;
  }
  if (!nextMetadata) {
    return currentMetadata;
  }

  const currentRender =
    currentMetadata.render && typeof currentMetadata.render === "object"
      ? (currentMetadata.render as Record<string, unknown>)
      : null;
  const nextRender =
    nextMetadata.render && typeof nextMetadata.render === "object"
      ? (nextMetadata.render as Record<string, unknown>)
      : null;

  const merged: Record<string, unknown> = {
    ...currentMetadata,
    ...nextMetadata,
  };

  if (currentRender || nextRender) {
    merged.render = {
      ...(currentRender || {}),
      ...(nextRender || {}),
    };
  }

  return merged;
};

export const buildToolStreamingMetadata = (
  toolCallId: string,
  toolName: string,
  rawArguments: string,
  phase: "pending" | "streaming" | "preview" | "error",
): Record<string, unknown> | undefined => {
  if (toolName !== SHOW_WIDGET_TOOL_NAME) {
    return undefined;
  }

  const partialArgs = extractPartialShowWidgetArgs(rawArguments);
  const widgetCode = partialArgs.widgetCode || "";
  const warningCodes: GenerativeWidgetWarningCode[] | undefined =
    phase === "preview" && !partialArgs.isLikelyComplete
      ? ["widget_arguments_incomplete"]
      : undefined;

  return buildGenerativeWidgetMetadata(
    buildGenerativeWidgetPayload({
      toolCallId,
      title: partialArgs.title,
      loadingMessages: partialArgs.loadingMessages,
      widgetCode,
      phase,
      warningCodes,
    }),
  );
};

export const upsertStreamingToolExecutions = (
  currentExecutions: ToolCallExecutionState[],
  toolCalls: ToolCallPayload[],
  phase: "pending" | "streaming" | "preview" | "error",
): ToolCallExecutionState[] => {
  const nextExecutions = [...currentExecutions];

  for (const call of toolCalls) {
    const existingIndex = nextExecutions.findIndex(
      (execution) => execution.toolCallId === call.id,
    );
    const nextMetadata = buildToolStreamingMetadata(
      call.id,
      call.function.name,
      call.function.arguments || "",
      phase,
    );

    if (existingIndex >= 0) {
      const current = nextExecutions[existingIndex];
      nextExecutions[existingIndex] = {
        ...current,
        toolName: call.function.name,
        input: call.function.arguments || "",
        metadata: mergeExecutionMetadata(current.metadata, nextMetadata),
      };
      continue;
    }

    nextExecutions.push({
      toolCallId: call.id,
      toolName: call.function.name,
      status: "pending",
      input: call.function.arguments || "",
      timestamp: Date.now(),
      metadata: nextMetadata,
    });
  }

  return nextExecutions;
};

export const mergeToolExecutionMetadata = mergeExecutionMetadata;

export const stripToolRenderMetadata = (
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const { render: _render, ...rest } = metadata;
  return Object.keys(rest).length > 0 ? rest : undefined;
};

export const resolveToolExecutionMetadata = ({
  toolName,
  currentMetadata,
  execution,
}: {
  toolName: string;
  currentMetadata?: Record<string, unknown>;
  execution?: ToolExecutionResult | null;
}): Record<string, unknown> | undefined => {
  if (!execution?.metadata) {
    return currentMetadata;
  }

  if (toolName === SHOW_WIDGET_TOOL_NAME && execution.isParameterError) {
    return stripToolRenderMetadata(execution.metadata);
  }

  if (toolName === SHOW_WIDGET_TOOL_NAME) {
    return execution.metadata;
  }

  return mergeExecutionMetadata(currentMetadata, execution.metadata);
};
