import type React from "react";
import type { ToolCallExecutionState } from "@tau/shared/chat-renderers";

export interface ToolCallCustomRendererProps {
  execution: ToolCallExecutionState;
  isDark: boolean;
  parsedInput: unknown | null;
  inputParseError?: string;
  rendererContext?: Record<string, unknown>;
  renderDefault: () => React.ReactNode;
}

export type ToolCallCustomRenderer = React.ComponentType<ToolCallCustomRendererProps>;
