import { invoke } from "@/electron";

export interface RemoteVideoCacheEntry {
  id: string;
  url: string;
  localPath: string;
  fileName: string;
  fileSize: number;
  title?: string;
  createdAt: string;
  lastAccessed: string;
}

export const addRemoteVideoCacheEntry = async (payload: {
  url: string;
  localPath: string;
  title?: string;
}): Promise<RemoteVideoCacheEntry> => {
  return await invoke("remote-video-cache:add", payload);
};

export const listRemoteVideoCache = async (): Promise<
  RemoteVideoCacheEntry[]
> => {
  return await invoke("remote-video-cache:list");
};

export const deleteRemoteVideoCacheEntry = async (
  id: string,
): Promise<boolean> => {
  return await invoke("remote-video-cache:delete", { id });
};

export const clearRemoteVideoCache = async (): Promise<void> => {
  return await invoke("remote-video-cache:clear");
};
