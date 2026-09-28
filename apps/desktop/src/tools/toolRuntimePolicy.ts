import { OPENAI_IMAGE_TOOL_NAMES } from "./openaiImageTools";

export const getToolExecutionTimeout = (toolName: string, defaultTimeout: number): number => {
  if (OPENAI_IMAGE_TOOL_NAMES.has(toolName)) {
    return 5 * 60 * 1000;
  }
  return defaultTimeout;
};
