import { invoke } from "@/electron";

export interface VideoNoteSearchParams {
  videoNoteId: number;
  mainDbName: string;
  query: string;
  limit?: number;
}

export interface VideoNoteSearchResult {
  videoNoteId: number;
  start: number;
  end: number;
  text: string;
  score: number;
  rrfScore?: number;
}

export const searchVideoNoteContent = async (
  params: VideoNoteSearchParams
): Promise<VideoNoteSearchResult[]> => {
  return await invoke("video-note-search-content", params);
};

export const rebuildVideoNoteIndexAfterEmbeddingSwitch = async (params: {
  dimensions: number;
  reason?: "config_switch" | "model_switch" | "db_switch" | "startup_reconcile";
  mainDbName?: string;
}): Promise<{
  reinitOk: boolean;
  queued: number;
  droppedPending: number;
  previousGeneration: number;
  currentGeneration: number;
}> => {
  return await invoke("video-note-rebuild-after-embedding-switch", params);
};

export const getVideoNoteIndexStatuses = async (params: {
  mainDbName: string;
  videoNoteIds: number[];
}): Promise<Record<number, { indexed: boolean }>> => {
  return await invoke("video-note-index-statuses", params);
};
