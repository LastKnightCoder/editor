import type { ChatSessionMessage } from "./llm";

export type ChatSource =
  "main-chat" | "pdf-chat" | "video-note-chat" | "vibe-learning-chat" | "audio-note-chat";
export type ChatSessionKey = `${ChatSource}:${number}`;
export type ChatRunStatus =
  | "queued"
  | "running"
  | "retrying"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface ChatRunRecord {
  runId: string;
  sessionKey: ChatSessionKey;
  source: ChatSource;
  chatId: number;
  status: ChatRunStatus;
  requestPayload: ChatSessionMessage[];
  userMessageClientId: string;
  assistantMessageClientId: string;
  attempt: number;
  assistantSnapshot: string;
  reasoningSnapshot: string;
  toolSnapshot: unknown[];
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export const createChatSessionKey = (source: ChatSource, chatId: number): ChatSessionKey =>
  `${source}:${chatId}`;
