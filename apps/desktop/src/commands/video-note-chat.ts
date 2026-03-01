import { invoke } from "@/electron";
import type {
  CreateVideoNoteChat,
  UpdateVideoNoteChat,
  VideoNoteChatMessage,
} from "@/types";

export const createVideoNoteChat = async (
  params: CreateVideoNoteChat,
): Promise<VideoNoteChatMessage> => {
  return await invoke("video-note-chat:create", params);
};

export const updateVideoNoteChat = async (
  params: UpdateVideoNoteChat,
): Promise<VideoNoteChatMessage | null> => {
  return await invoke("video-note-chat:update", params);
};

export const deleteVideoNoteChat = async (id: number): Promise<boolean> => {
  return await invoke("video-note-chat:delete", id);
};

export const getVideoNoteChatById = async (
  id: number,
): Promise<VideoNoteChatMessage | null> => {
  return await invoke("video-note-chat:get", id);
};

export const getVideoNoteChatsByVideoNoteId = async (
  videoNoteId: number,
): Promise<VideoNoteChatMessage[]> => {
  return await invoke("video-note-chat:list-by-video-note-id", videoNoteId);
};

export const getVideoNoteChatBranches = async (
  parentChatId: number,
): Promise<VideoNoteChatMessage[]> => {
  return await invoke("video-note-chat:get-branches", parentChatId);
};

export const getVideoNoteNextBranchIndex = async (
  parentChatId: number,
): Promise<number> => {
  return await invoke("video-note-chat:get-next-branch-index", parentChatId);
};

export const getVideoNoteChildBranchesCount = async (
  parentChatId: number,
): Promise<number> => {
  return await invoke("video-note-chat:get-child-branches-count", parentChatId);
};
