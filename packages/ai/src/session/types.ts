import type { MessageContent } from "@tau/shared/chat-core";

export const SESSION_FORMAT_VERSION = 3;
export const DISPLAY_ENTRY_TYPE = "desktop-display";
export const LEAF_ENTRY_TYPE = "desktop-leaf";

export interface SessionHeader {
  type: "session";
  version: typeof SESSION_FORMAT_VERSION;
  id: string;
  timestamp: string;
  cwd: string;
  [key: string]: unknown;
}

export interface PiTranscriptMessage {
  role?: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  details?: unknown;
  timestamp?: number;
  provider?: string;
  model?: string;
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
  [key: string]: unknown;
}

export interface SessionEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: PiTranscriptMessage;
  [key: string]: unknown;
}

export interface SessionDiagnostic {
  code: "incomplete-tail";
  line: number;
  byteOffset: number;
  raw: string;
}

export interface SessionDocument {
  header: SessionHeader;
  entries: SessionEntry[];
  diagnostics: SessionDiagnostic[];
}

export interface PiTranscriptEntry {
  id: string;
  message: PiTranscriptMessage;
  display?: { content: MessageContent[]; clientId?: string };
  versions?: { ids: string[]; index: number };
}

export interface SessionContext {
  messages: PiTranscriptMessage[];
  thinkingLevel: string;
  model: { provider: string; modelId: string } | null;
}

export type SessionEdit =
  | { kind: "rewind"; entryId: string }
  | { kind: "fork"; entryId: string }
  | { kind: "switch"; entryId: string }
  | { kind: "omit"; entryIds: string[] };

export interface SessionEntryInput {
  type: string;
  id?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
