import React, { memo, useSyncExternalStore } from "react";
import { cn } from "@tau/ui";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import { ToolCallRow } from "../Message/ToolCallRow";
import { toolCallRendererRegistry } from "../../../renderers";
import ToolCallRendererErrorBoundary from "./ToolCallRendererErrorBoundary";

export interface ToolCallDefaultItemRenderParams {
  execution: ToolCallExecutionState;
  isDark: boolean;
}

export interface ToolCallDisplayProps {
  /** 工具调用执行状态列表 */
  executions: ToolCallExecutionState[];
  /** 是否为暗色主题 */
  isDark?: boolean;
  /** 覆盖默认单项渲染，仍复用本包的自定义渲染链路。 */
  renderDefaultItem?: (params: ToolCallDefaultItemRenderParams) => React.ReactNode;
  rendererContext?: Record<string, unknown>;
  className?: string;
}

const getRendererKeyFromMetadata = (
  metadata: Record<string, unknown> | undefined
): string | null => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const render =
    "render" in metadata && metadata.render && typeof metadata.render === "object"
      ? (metadata.render as Record<string, unknown>)
      : null;
  if (!render) {
    return null;
  }

  const rendererKey = render.rendererKey;
  return typeof rendererKey === "string" && rendererKey.trim().length > 0
    ? rendererKey.trim()
    : null;
};

const parseToolInput = (
  input: string
): { parsedInput: unknown | null; inputParseError?: string } => {
  if (!input.trim()) {
    return { parsedInput: null };
  }

  try {
    return { parsedInput: JSON.parse(input) };
  } catch (error) {
    return {
      parsedInput: null,
      inputParseError: (error as Error).message,
    };
  }
};

const ToolCallRendererItem: React.FC<{
  execution: ToolCallExecutionState;
  isDark: boolean;
  renderDefaultItem?: (params: ToolCallDefaultItemRenderParams) => React.ReactNode;
  rendererContext?: Record<string, unknown>;
}> = memo(function ToolCallRendererItem({ execution, isDark, renderDefaultItem, rendererContext }) {
  useSyncExternalStore(
    toolCallRendererRegistry.subscribe,
    toolCallRendererRegistry.getSnapshot,
    toolCallRendererRegistry.getSnapshot
  );
  const renderDefault = () =>
    renderDefaultItem ? (
      renderDefaultItem({ execution, isDark })
    ) : (
      <ToolCallRow execution={execution} />
    );

  const rendererKey = getRendererKeyFromMetadata(execution.metadata) || "";
  // 退役代理的所有工具统一展示历史输入输出，不再挂载专用渲染器。
  const isRetiredExecution = typeof execution.metadata?.codexItemType === "string";
  const customRenderer = isRetiredExecution
    ? undefined
    : toolCallRendererRegistry.getRegistration(rendererKey) ||
      toolCallRendererRegistry.getRegistration(execution.toolName);
  if (!customRenderer) {
    return renderDefault();
  }

  const parsedInputResult = parseToolInput(execution.input);
  const CustomRenderer = customRenderer.renderer;

  return (
    <ToolCallRendererErrorBoundary
      key={customRenderer.generation}
      toolName={execution.toolName}
      fallback={renderDefault()}
    >
      <CustomRenderer
        execution={execution}
        isDark={isDark}
        parsedInput={parsedInputResult.parsedInput}
        inputParseError={parsedInputResult.inputParseError}
        rendererContext={rendererContext}
        renderDefault={renderDefault}
      />
    </ToolCallRendererErrorBoundary>
  );
});

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = memo(function ToolCallDisplay({
  executions,
  isDark = false,
  renderDefaultItem,
  rendererContext,
  className,
}) {
  if (!executions || executions.length === 0) return null;

  return (
    <div className={cn("my-2 space-y-2", className)}>
      {executions.map(exec => (
        <ToolCallRendererItem
          key={exec.toolCallId}
          execution={exec}
          isDark={isDark}
          renderDefaultItem={renderDefaultItem}
          rendererContext={rendererContext}
        />
      ))}
    </div>
  );
});

export default ToolCallDisplay;
