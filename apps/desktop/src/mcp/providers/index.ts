export { type MCPProviderDefinition } from "./types";
export { cardToolsProvider } from "./card-tools";
export { articleToolsProvider } from "./article-tools";
export { diaryToolsProvider } from "./diary-tools";
export { calendarEventToolsProvider } from "./calendar-event-tools";
export { projectToolsProvider } from "./project-tools";
export { flashcardToolsProvider } from "./flashcard-tools";

import { cardToolsProvider } from "./card-tools";
import { articleToolsProvider } from "./article-tools";
import { diaryToolsProvider } from "./diary-tools";
import { calendarEventToolsProvider } from "./calendar-event-tools";
import { projectToolsProvider } from "./project-tools";
import { flashcardToolsProvider } from "./flashcard-tools";
import type { MCPProviderDefinition } from "./types";

export const MCP_PROVIDERS: MCPProviderDefinition[] = [
  cardToolsProvider,
  articleToolsProvider,
  diaryToolsProvider,
  calendarEventToolsProvider,
  projectToolsProvider,
  flashcardToolsProvider,
];
