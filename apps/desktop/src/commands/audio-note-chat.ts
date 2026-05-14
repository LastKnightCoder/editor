import { invoke } from "@/electron";
import type {
  CreateAudioNoteChat,
  UpdateAudioNoteChat,
  AudioNoteChatMessage,
} from "@/types";

export const createAudioNoteChat = async (
  params: CreateAudioNoteChat,
): Promise<AudioNoteChatMessage> => {
  return await invoke("audio-note-chat:create", params);
};

export const updateAudioNoteChat = async (
  params: UpdateAudioNoteChat,
): Promise<AudioNoteChatMessage | null> => {
  return await invoke("audio-note-chat:update", params);
};

export const deleteAudioNoteChat = async (id: number): Promise<boolean> => {
  return await invoke("audio-note-chat:delete", id);
};

export const getAudioNoteChatById = async (
  id: number,
): Promise<AudioNoteChatMessage | null> => {
  return await invoke("audio-note-chat:get", id);
};

export const getAudioNoteChatsByAudioNoteId = async (
  audioNoteId: number,
): Promise<AudioNoteChatMessage[]> => {
  return await invoke("audio-note-chat:list-by-audio-note-id", audioNoteId);
};

export const getAudioNoteChatBranches = async (
  parentChatId: number,
): Promise<AudioNoteChatMessage[]> => {
  return await invoke("audio-note-chat:get-branches", parentChatId);
};

export const getAudioNoteNextBranchIndex = async (
  parentChatId: number,
): Promise<number> => {
  return await invoke("audio-note-chat:get-next-branch-index", parentChatId);
};

export const getAudioNoteChildBranchesCount = async (
  parentChatId: number,
): Promise<number> => {
  return await invoke("audio-note-chat:get-child-branches-count", parentChatId);
};
