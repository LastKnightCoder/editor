/** 桌面的工具调用块：通用实现来自 @tau/chat-ui，等待确认时在工具行下方接桌面的确认条（D-060） */

import { memo, type ComponentProps } from "react";
import type { ToolCallExecutionState } from "@tau/shared";
import { ToolCallBlock as BaseToolCallBlock } from "@tau/chat-ui";
import { ToolApprovalBar } from "./ToolApprovalBar";

const renderApproval = (execution: ToolCallExecutionState) => (
  <ToolApprovalBar execution={execution} />
);

export const ToolCallBlock = memo(function ToolCallBlock(
  props: Omit<ComponentProps<typeof BaseToolCallBlock>, "renderApproval">
) {
  return <BaseToolCallBlock {...props} renderApproval={renderApproval} />;
});
