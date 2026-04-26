export { type MCPProviderDefinition } from "./types";
export { cardToolsProvider } from "./card-tools";
export { articleToolsProvider } from "./article-tools";
export { diaryToolsProvider } from "./diary-tools";
export { calendarEventToolsProvider } from "./calendar-event-tools";
export { projectToolsProvider } from "./project-tools";
export { flashcardToolsProvider } from "./flashcard-tools";
export { tabToolsProvider } from "./tab-tools";
export { whiteboardToolsProvider } from "./whiteboard-tools";
export { videoNoteToolsProvider } from "./video-note-tools";
export { contentEditToolsProvider } from "./content-edit-tools";
export { contentReferenceToolsProvider } from "./content-reference-tools";
export { fetchToolsProvider } from "./fetch-tools";
export { filesystemToolsProvider } from "./filesystem-tools";
export { todoToolsProvider } from "./todo-tools";
export { questionToolsProvider } from "./question-tools";
export { openAIImageToolsProvider } from "./openai-image-tools";

import { cardToolsProvider } from "./card-tools";
import { articleToolsProvider } from "./article-tools";
import { diaryToolsProvider } from "./diary-tools";
import { calendarEventToolsProvider } from "./calendar-event-tools";
import { projectToolsProvider } from "./project-tools";
import { flashcardToolsProvider } from "./flashcard-tools";
import { tabToolsProvider } from "./tab-tools";
import { whiteboardToolsProvider } from "./whiteboard-tools";
import { videoNoteToolsProvider } from "./video-note-tools";
import { contentEditToolsProvider } from "./content-edit-tools";
import { contentReferenceToolsProvider } from "./content-reference-tools";
import { fetchToolsProvider } from "./fetch-tools";
import { filesystemToolsProvider } from "./filesystem-tools";
import { todoToolsProvider } from "./todo-tools";
import { questionToolsProvider } from "./question-tools";
import { openAIImageToolsProvider } from "./openai-image-tools";
import type { MCPProviderDefinition } from "./types";

export const MCP_PROVIDERS: MCPProviderDefinition[] = [
  cardToolsProvider,
  articleToolsProvider,
  diaryToolsProvider,
  calendarEventToolsProvider,
  projectToolsProvider,
  flashcardToolsProvider,
  tabToolsProvider,
  whiteboardToolsProvider,
  videoNoteToolsProvider,
  contentEditToolsProvider,
  contentReferenceToolsProvider,
  fetchToolsProvider,
  filesystemToolsProvider,
  todoToolsProvider,
  questionToolsProvider,
  openAIImageToolsProvider,
];
