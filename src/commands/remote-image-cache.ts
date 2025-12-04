import { invoke } from "@/electron";

export interface RemoteImageCacheEntry {
  id: string;
  url: string;
  localPath: string;
  fileName: string;
  fileSize: number;
  title?: string;
  createdAt: string;
  lastAccessed: string;
}

export const addRemoteImageCacheEntry = async (payload: {
  url: string;
  localPath: string;
  title?: string;
}): Promise<RemoteImageCacheEntry> => {
  return await invoke("remote-image-cache:add", payload);
};

export const listRemoteImageCache = async (): Promise<
  RemoteImageCacheEntry[]
> => {
  return await invoke("remote-image-cache:list");
};

export const deleteRemoteImageCacheEntry = async (
  id: string,
): Promise<boolean> => {
  return await invoke("remote-image-cache:delete", { id });
};

export const clearRemoteImageCache = async (): Promise<void> => {
  return await invoke("remote-image-cache:clear");
};
