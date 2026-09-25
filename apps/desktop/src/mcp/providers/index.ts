export { type MCPProviderDefinition } from "./types";
export { calendarEventToolsProvider } from "./calendar-event-tools";
export { videoNoteToolsProvider } from "./video-note-tools";
export { contentEditToolsProvider } from "./content-edit-tools";
export { fetchToolsProvider } from "./fetch-tools";
export { filesystemToolsProvider } from "./filesystem-tools";
export { openAIImageToolsProvider } from "./openai-image-tools";
export { sqlQueryToolsProvider } from "./sql-query-tools";

import { calendarEventToolsProvider } from "./calendar-event-tools";
import { videoNoteToolsProvider } from "./video-note-tools";
import { contentEditToolsProvider } from "./content-edit-tools";
import { fetchToolsProvider } from "./fetch-tools";
import { filesystemToolsProvider } from "./filesystem-tools";
import { openAIImageToolsProvider } from "./openai-image-tools";
import { sqlQueryToolsProvider } from "./sql-query-tools";
import type { MCPProviderDefinition } from "./types";

export const MCP_PROVIDERS: MCPProviderDefinition[] = [
  calendarEventToolsProvider,
  videoNoteToolsProvider,
  contentEditToolsProvider,
  fetchToolsProvider,
  filesystemToolsProvider,
  openAIImageToolsProvider,
  sqlQueryToolsProvider,
];
