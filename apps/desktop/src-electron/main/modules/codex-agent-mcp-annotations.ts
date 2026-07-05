import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

const TAU_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

export const getTauToolAnnotations = (): ToolAnnotations => ({
  ...TAU_TOOL_ANNOTATIONS,
});
