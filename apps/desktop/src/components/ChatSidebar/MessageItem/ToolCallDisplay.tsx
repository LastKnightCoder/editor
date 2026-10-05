import React from "react";
import type { ToolCallExecutionState } from "@tau/shared";
import { ToolCallRow } from "@tau/chat-ui";
import { ToolCallBlock } from "@/components/ChatUI";

interface ToolCallDisplayProps {
  execution: ToolCallExecutionState;
  isDark: boolean;
  markdownComponents?: any;
}

/** 兼容入口：子代理等渲染器嵌套展示工具调用时沿用本组件，实现已收口到 ChatUI（D-048） */
const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
  execution,
  isDark,
  markdownComponents,
}) => (
  <ToolCallBlock execution={execution} isDark={isDark} rendererContext={{ markdownComponents }} />
);

export { ToolCallRow as DefaultToolCallDisplay };
export default React.memo(ToolCallDisplay);
