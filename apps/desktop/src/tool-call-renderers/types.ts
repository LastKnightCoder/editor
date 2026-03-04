import type React from "react";
import type { ToolCallExecutionState } from "@/types";

export interface ToolCallCustomRendererProps {
  execution: ToolCallExecutionState;
  isDark: boolean;
  parsedInput: unknown | null;
  inputParseError?: string;
  renderDefault: () => React.ReactNode;
}

export type ToolCallCustomRenderer =
  React.ComponentType<ToolCallCustomRendererProps>;
