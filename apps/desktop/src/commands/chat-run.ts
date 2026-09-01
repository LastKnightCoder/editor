import { invoke } from "@/electron";
import type { ChatRunRecord, ChatRunStatus } from "@/types/chat-run";

export const createChatRun = (
  record: Omit<ChatRunRecord, "createdAt" | "updatedAt">,
): Promise<ChatRunRecord> => invoke("chat-run:create", record);
export const updateChatRun = (record: ChatRunRecord): Promise<ChatRunRecord> =>
  invoke("chat-run:update", record);
export const getChatRun = (runId: string): Promise<ChatRunRecord | null> =>
  invoke("chat-run:get", runId);
export const getActiveChatRuns = (): Promise<ChatRunRecord[]> =>
  invoke("chat-run:get-active");
export const finalizeChatRun = (
  runId: string,
  status: Extract<ChatRunStatus, "completed" | "cancelled">,
  errorMessage?: string | null,
): Promise<ChatRunRecord | null> =>
  invoke("chat-run:finalize", runId, status, errorMessage);
export const deleteChatRun = (runId: string): Promise<number> =>
  invoke("chat-run:delete", runId);
export const deleteChatRunsForSession = (sessionKey: string): Promise<number> =>
  invoke("chat-run:delete-session", sessionKey);
