import React, { useState, memo, useCallback } from "react";
import classNames from "classnames";
import type { ToolCallExecutionState, ToolCallStatus } from "./types";
import { StatusBadge } from "./StatusBadge";
import { getToolCallRenderer } from "./toolCallRendererRegistry";
import ToolCallRendererErrorBoundary from "./ToolCallRendererErrorBoundary";

export interface ToolCallDefaultItemRenderParams {
  execution: ToolCallExecutionState;
  isDark: boolean;
  ToolIcon: React.ComponentType<{ className?: string }>;
  renderToolName?: (toolName: string) => React.ReactNode;
}

export interface ToolCallDisplayProps {
  /** 工具调用执行状态列表 */
  executions: ToolCallExecutionState[];
  /** 是否为暗色主题 */
  isDark?: boolean;
  /** 工具图标组件 */
  ToolIcon?: React.ComponentType<{ className?: string }>;
  /** 自定义渲染工具名称 */
  renderToolName?: (toolName: string) => React.ReactNode;
  /** 覆盖默认单项渲染（用于宿主自定义外观，仍复用 shared 的自定义渲染链路） */
  renderDefaultItem?: (
    params: ToolCallDefaultItemRenderParams,
  ) => React.ReactNode;
  className?: string;
}

/** 状态图标颜色映射 */
const statusIconColors: Record<ToolCallStatus, string> = {
  pending: "text-gray-400",
  executing: "text-blue-500 animate-pulse",
  success: "text-green-500",
  failed: "text-red-500",
  retrying: "text-yellow-500",
};

/** 默认工具图标 */
const DefaultToolIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

/** 格式化 JSON 字符串 */
function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

const getRendererKeyFromMetadata = (
  metadata: Record<string, unknown> | undefined,
): string | null => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const render =
    "render" in metadata &&
    metadata.render &&
    typeof metadata.render === "object"
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
  input: string,
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

/** 单个工具调用项 */
const ToolCallItem: React.FC<{
  execution: ToolCallExecutionState;
  isDark: boolean;
  ToolIcon: React.ComponentType<{ className?: string }>;
  renderToolName?: (toolName: string) => React.ReactNode;
}> = memo(function ToolCallItem({
  execution,
  isDark,
  ToolIcon,
  renderToolName,
}) {
  // 智能折叠：失败或重试时展开
  const [isExpanded, setIsExpanded] = useState(
    execution.status === "failed" || execution.status === "retrying",
  );

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  return (
    <div
      className={classNames(
        "rounded-lg border p-3",
        isDark
          ? "bg-zinc-800/50 border-gray-700"
          : "bg-gray-50 border-gray-200",
      )}
    >
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={toggle}
      >
        <div className="flex items-center gap-2">
          <ToolIcon
            className={classNames(
              "text-sm",
              statusIconColors[execution.status],
            )}
          />
          <span className="font-medium text-sm">
            {renderToolName
              ? renderToolName(execution.toolName)
              : execution.toolName}
          </span>
          <StatusBadge status={execution.status} />
        </div>
        {execution.duration && (
          <span className="text-xs text-gray-400">
            {(execution.duration / 1000).toFixed(2)}s
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-2 text-xs">
          {/* 输入 */}
          {execution.input && (
            <div>
              <span className="text-gray-400">输入：</span>
              <pre
                className={classNames(
                  "mt-1 p-2 rounded overflow-auto max-h-32 font-mono text-xs",
                  isDark ? "bg-zinc-900" : "bg-gray-100",
                )}
              >
                {formatJson(execution.input)}
              </pre>
            </div>
          )}

          {execution.output && (
            <div>
              <span className="text-gray-400">输出：</span>
              <pre
                className={classNames(
                  "mt-1 p-2 rounded overflow-auto font-mono text-xs max-h-[200px] overflow-y-auto",
                  isDark ? "bg-zinc-900" : "bg-gray-100",
                )}
              >
                {execution.output}
              </pre>
            </div>
          )}

          {/* 错误 */}
          {execution.error && (
            <div>
              <span className="text-red-400">错误：</span>
              <pre className="mt-1 p-2 rounded bg-red-900/20 text-red-300 overflow-auto max-h-32">
                {execution.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

const ToolCallRendererItem: React.FC<{
  execution: ToolCallExecutionState;
  isDark: boolean;
  ToolIcon: React.ComponentType<{ className?: string }>;
  renderToolName?: (toolName: string) => React.ReactNode;
  renderDefaultItem?: (
    params: ToolCallDefaultItemRenderParams,
  ) => React.ReactNode;
}> = memo(function ToolCallRendererItem({
  execution,
  isDark,
  ToolIcon,
  renderToolName,
  renderDefaultItem,
}) {
  const renderDefault = () =>
    renderDefaultItem ? (
      renderDefaultItem({
        execution,
        isDark,
        ToolIcon,
        renderToolName,
      })
    ) : (
      <ToolCallItem
        execution={execution}
        isDark={isDark}
        ToolIcon={ToolIcon}
        renderToolName={renderToolName}
      />
    );

  const customRenderer =
    getToolCallRenderer(getRendererKeyFromMetadata(execution.metadata) || "") ||
    getToolCallRenderer(execution.toolName);
  if (!customRenderer) {
    return renderDefault();
  }

  const parsedInputResult = parseToolInput(execution.input);
  const CustomRenderer = customRenderer;

  return (
    <ToolCallRendererErrorBoundary
      toolName={execution.toolName}
      fallback={renderDefault()}
    >
      <CustomRenderer
        execution={execution}
        isDark={isDark}
        parsedInput={parsedInputResult.parsedInput}
        inputParseError={parsedInputResult.inputParseError}
        renderDefault={renderDefault}
      />
    </ToolCallRendererErrorBoundary>
  );
});

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = memo(
  function ToolCallDisplay({
    executions,
    isDark = false,
    ToolIcon = DefaultToolIcon,
    renderToolName,
    renderDefaultItem,
    className,
  }) {
    if (!executions || executions.length === 0) return null;

    return (
      <div className={classNames("my-2 space-y-2", className)}>
        {executions.map((exec) => (
          <ToolCallRendererItem
            key={exec.toolCallId}
            execution={exec}
            isDark={isDark}
            ToolIcon={ToolIcon}
            renderToolName={renderToolName}
            renderDefaultItem={renderDefaultItem}
          />
        ))}
      </div>
    );
  },
);

export default ToolCallDisplay;
