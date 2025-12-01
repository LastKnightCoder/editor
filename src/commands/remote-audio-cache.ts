import { invoke } from "@/electron";

export interface RemoteAudioCacheEntry {
  id: string;
  url: string;
  localPath: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

export const addRemoteAudioCacheEntry = async (payload: {
  url: string;
  localPath: string;
}): Promise<RemoteAudioCacheEntry> => {
  return await invoke("remote-audio-cache:add", payload);
};

export const listRemoteAudioCache = async (): Promise<
  RemoteAudioCacheEntry[]
> => {
  return await invoke("remote-audio-cache:list");
};

export const deleteRemoteAudioCacheEntry = async (
  id: string,
): Promise<boolean> => {
  return await invoke("remote-audio-cache:delete", { id });
};

export const clearRemoteAudioCache = async (): Promise<void> => {
  return await invoke("remote-audio-cache:clear");
};
