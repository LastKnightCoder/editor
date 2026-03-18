import { ASK_QUESTION_TOOL_NAME } from "./askQuestionTypes";

const CONTENT_EDIT_REVIEW_TOOL_NAMES = new Set([
  "rewrite_content_full",
  "apply_content_edit_operations",
  "replace_content_by_text",
]);

export const filterConflictingToolSchemas = <
  T extends { function?: { name?: string } },
>(
  tools: T[],
  externalTools: Array<{ function: { name: string } }> = [],
): T[] => {
  const hasExternalAskQuestionTool = externalTools.some(
    (tool) => tool.function.name === ASK_QUESTION_TOOL_NAME,
  );

  if (!hasExternalAskQuestionTool) {
    return tools;
  }

  return tools.filter((tool) => tool.function?.name !== ASK_QUESTION_TOOL_NAME);
};

export const shouldSkipToolTimeout = (toolName: string): boolean => {
  return (
    toolName === ASK_QUESTION_TOOL_NAME ||
    CONTENT_EDIT_REVIEW_TOOL_NAMES.has(toolName)
  );
};
