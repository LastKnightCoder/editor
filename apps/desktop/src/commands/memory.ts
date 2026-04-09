import { invoke } from "@/electron";
import type {
  DeleteWithMemoryResult,
  MemorySearchHit,
  MemorySearchParams,
  MemorySourceContextParams,
  MemoryStatus,
} from "@/types";

export const getMemoryStatus = (): Promise<MemoryStatus> => {
  return invoke("memory-status");
};

export const searchMemory = async (
  params: MemorySearchParams,
): Promise<{ hits: MemorySearchHit[]; query: string }> => {
  return invoke("memory-search", params);
};

export const getMemorySourceContext = async (
  params: MemorySourceContextParams,
): Promise<Record<string, unknown>> => {
  return invoke("memory-get-source-context", params);
};

export const rebuildCurrentMemory = (): Promise<{ success: boolean }> => {
  return invoke("memory-rebuild-current-db");
};

export const rebuildChatMemory = (
  chatId: number,
): Promise<{ success: boolean }> => {
  return invoke("memory-rebuild-chat", { chatId });
};

export const rebuildDiaryMemory = (
  diaryId: number,
): Promise<{ success: boolean }> => {
  return invoke("memory-rebuild-diary", { diaryId });
};

export const touchChatMemorySession = (
  chatId: number,
): Promise<{ success: boolean }> => {
  return invoke("memory-touch-chat-session", { chatId });
};

export const flushChatMemorySession = (
  chatId: number,
): Promise<{ success: boolean }> => {
  return invoke("memory-flush-chat-session", { chatId });
};

export const deleteChatMemorySources = (
  chatIds: number[],
): Promise<{ success: boolean }> => {
  return invoke("memory-delete-chat-sources", { chatIds });
};

export const deleteDiaryMemorySource = (
  diaryId: number,
): Promise<{ success: boolean }> => {
  return invoke("memory-delete-diary-source", { diaryId });
};

export const deleteChatWithMemory = (
  chatId: number,
): Promise<DeleteWithMemoryResult> => {
  return invoke("memory-delete-chat-message", { chatId });
};

export const deleteDiaryWithMemory = (
  diaryId: number,
): Promise<DeleteWithMemoryResult> => {
  return invoke("memory-delete-diary-entry", { diaryId });
};
