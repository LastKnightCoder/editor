export { type MCPProviderDefinition } from "./types";
export { contentEditToolsProvider } from "./content-edit-tools";
export { contextToolsProvider } from "./context-tools";
export { dataTableToolsProvider } from "./data-table-tools";
export { fetchToolsProvider } from "./fetch-tools";
export { filesystemToolsProvider } from "./filesystem-tools";
export { openAIImageToolsProvider } from "./openai-image-tools";
export { sqlQueryToolsProvider } from "./sql-query-tools";
export { taskAssistantToolsProvider } from "./task-assistant-tools";

import { contentEditToolsProvider } from "./content-edit-tools";
import { contextToolsProvider } from "./context-tools";
import { dataTableToolsProvider } from "./data-table-tools";
import { fetchToolsProvider } from "./fetch-tools";
import { filesystemToolsProvider } from "./filesystem-tools";
import { openAIImageToolsProvider } from "./openai-image-tools";
import { sqlQueryToolsProvider } from "./sql-query-tools";
import { taskAssistantToolsProvider } from "./task-assistant-tools";
import type { MCPProviderDefinition } from "./types";

export const MCP_PROVIDERS: MCPProviderDefinition[] = [
  contentEditToolsProvider,
  contextToolsProvider,
  dataTableToolsProvider,
  fetchToolsProvider,
  filesystemToolsProvider,
  openAIImageToolsProvider,
  sqlQueryToolsProvider,
  taskAssistantToolsProvider,
];
