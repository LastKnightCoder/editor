import type { ContentLinkElement } from "./content-link/types";
import type { SkillRefElement } from "./skill-ref/types";
import type { DatabaseElement } from "./database/types";
import type { FileAttachmentElement } from "./file-attachment/types";
import type { FlashcardBlankElement } from "./flashcard-blank/types";
import type { ProjectCardListElement } from "./project-card-list/types";
import type { WhiteboardElement } from "./whiteboard/types";
import type { VideoScreenshotElement } from "@/components/VideoNotePanel/extensions/VideoScreenshot";
import type { VideoTimestampElement } from "@/components/VideoNotePanel/extensions/VideoTimestamp";
import type { SummaryTimestampElement } from "@/components/VideoNotePanel/extensions/SummaryTimestamp";
import type {} from "@tau/editor/api";

declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "content-link": ContentLinkElement;
    "skill-ref": SkillRefElement;
    "file-attachment": FileAttachmentElement;
    "project-card-list": ProjectCardListElement;
    whiteboard: WhiteboardElement;
    database: DatabaseElement;
    "flashcard-blank": FlashcardBlankElement;
    "video-screenshot": VideoScreenshotElement;
    "video-timestamp": VideoTimestampElement;
    "summary-timestamp": SummaryTimestampElement;
  }

  interface ExtensionInlineElementMap {
    "content-link": ContentLinkElement;
    "skill-ref": SkillRefElement;
    "flashcard-blank": FlashcardBlankElement;
    "video-timestamp": VideoTimestampElement;
    "summary-timestamp": SummaryTimestampElement;
  }
}

export {};
