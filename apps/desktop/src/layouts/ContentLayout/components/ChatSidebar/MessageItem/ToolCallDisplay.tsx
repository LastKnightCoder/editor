import React from "react";
import {
  ChatToolCallDefaultItem,
  ChatToolCallDisplay,
  type ToolCallExecutionState,
} from "@tau/shared";

interface ToolCallDisplayProps {
  execution: ToolCallExecutionState;
  isDark: boolean;
  markdownComponents?: any;
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
  execution,
  isDark,
  markdownComponents,
}) => {
  return (
    <ChatToolCallDisplay
      execution={execution}
      isDark={isDark}
      rendererContext={{ markdownComponents }}
    />
  );
};

export { ChatToolCallDefaultItem as DefaultToolCallDisplay };
export default React.memo(ToolCallDisplay);
