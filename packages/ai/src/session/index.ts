export * from "./types";
export * from "./codec";
export * from "./tree";
export * from "./context";
export * from "./convert";
export { projectTranscriptMessages } from "./projection";
import type { SessionDocument } from "./types";
import { getSessionTranscript } from "./tree";
import { projectTranscriptMessages } from "./projection";

export const projectSessionMessages = (document: SessionDocument, leafId?: string | null) =>
  projectTranscriptMessages(getSessionTranscript(document, leafId));
