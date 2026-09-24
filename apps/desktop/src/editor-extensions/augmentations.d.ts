import type { ChatReferenceElement } from "./chat-reference/types";
import type { ContentLinkElement } from "./content-link/types";
import type { DatabaseElement } from "./database/types";
import type { FileAttachmentElement } from "./file-attachment/types";
import type { FlashcardBlankElement } from "./flashcard-blank/types";
import type { ProjectCardListElement } from "./project-card-list/types";
import type { QuestionElement } from "./question-card/types";
import type { WhiteboardElement } from "./whiteboard/types";
import type {} from "@tau/editor/src/types/custom-element";

declare module "@tau/editor/src/types/custom-element" {
  interface ExternalElementMap {
    "content-link": ContentLinkElement;
    "file-attachment": FileAttachmentElement;
    question: QuestionElement;
    "chat-reference": ChatReferenceElement;
    "project-card-list": ProjectCardListElement;
    whiteboard: WhiteboardElement;
    database: DatabaseElement;
    "flashcard-blank": FlashcardBlankElement;
  }

  interface ExternalInlineElementMap {
    "content-link": ContentLinkElement;
    "flashcard-blank": FlashcardBlankElement;
  }
}

export {};
