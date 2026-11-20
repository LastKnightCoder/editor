export { type MCPProviderDefinition } from "./types";

import { assistantMemoryToolsProvider } from "./assistant-memory-tools";
import { articleToolsProvider } from "./article-tools";
import { cardToolsProvider } from "./card-tools";
import { contentEditToolsProvider } from "./content-edit-tools";
import { contentLinkToolsProvider } from "./content-link-tools";
import { contextToolsProvider } from "./context-tools";
import { dataTableToolsProvider } from "./data-table-tools";
import { fetchToolsProvider } from "./fetch-tools";
import { filesystemToolsProvider } from "./filesystem-tools";
import { openAIImageToolsProvider } from "./openai-image-tools";
import { sqlQueryToolsProvider } from "./sql-query-tools";
import { taskAssistantToolsProvider } from "./task-assistant-tools";
import type { MCPProviderDefinition } from "./types";

export const MCP_PROVIDERS: MCPProviderDefinition[] = [
  articleToolsProvider,
  cardToolsProvider,
  contentEditToolsProvider,
  contentLinkToolsProvider,
  contextToolsProvider,
  dataTableToolsProvider,
  fetchToolsProvider,
  filesystemToolsProvider,
  openAIImageToolsProvider,
  sqlQueryToolsProvider,
  taskAssistantToolsProvider,
  assistantMemoryToolsProvider,
];
