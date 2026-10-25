/**
 * 单条工具调用：接渲染注册表——有自定义渲染器（日程、待办、检索……）走渲染器，否则落到 ToolCallRow。
 * 等待确认时一律走通用行（自定义渲染器此刻还没有结果可画），确认 UI 由宿主经 renderApproval 注入。
 */

import { memo, type ReactNode } from "react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";
import {
  ToolCallDisplay,
  type ToolCallDefaultItemRenderParams,
} from "../ChatComponents/ToolCallDisplay";
import { ToolCallRow } from "./ToolCallRow";

export const ToolCallBlock = memo(function ToolCallBlock({
  execution,
  isDark,
  rendererContext,
  renderApproval,
  renderDefaultItem,
}: {
  execution: ToolCallExecutionState;
  isDark: boolean;
  rendererContext?: Record<string, unknown>;
  renderApproval?: (execution: ToolCallExecutionState) => ReactNode;
  /** 没有自定义渲染器时的单项渲染（缺省 ToolCallRow） */
  renderDefaultItem?: (params: ToolCallDefaultItemRenderParams) => ReactNode;
}) {
  if (execution.status === "awaiting-approval") {
    return (
      <div className="min-w-0">
        <ToolCallRow execution={execution} />
        {renderApproval?.(execution)}
      </div>
    );
  }
  return (
    <ToolCallDisplay
      executions={[execution]}
      isDark={isDark}
      className="my-0 space-y-0"
      rendererContext={rendererContext}
      renderDefaultItem={renderDefaultItem}
    />
  );
});
