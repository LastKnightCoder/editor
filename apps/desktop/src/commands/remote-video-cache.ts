import { invoke, on, off } from "@/electron";

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

export interface RemoteVideoCacheProgress {
  requestId: number;
  stage: "downloading" | "completed" | "error";
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
}

export interface RemoteVideoCacheStatus {
  cached: boolean;
  localPath?: string;
  fileSize?: number;
}

export const addRemoteVideoCacheEntry = async (payload: {
  url: string;
  localPath: string;
  title?: string;
}): Promise<RemoteVideoCacheEntry> => {
  return await invoke("remote-video-cache:add", payload);
};

export const listRemoteVideoCache = async (): Promise<RemoteVideoCacheEntry[]> => {
  return await invoke("remote-video-cache:list");
};

export const deleteRemoteVideoCacheEntry = async (id: string): Promise<boolean> => {
  return await invoke("remote-video-cache:delete", { id });
};

export const clearRemoteVideoCache = async (): Promise<void> => {
  return await invoke("remote-video-cache:clear");
};

export const downloadRemoteVideoWithProgress = async (
  payload: {
    url: string;
    fileName?: string;
  },
  onProgress?: (progress: RemoteVideoCacheProgress) => void
): Promise<{ localPath: string; fileSize: number; cached: boolean; requestId: number }> => {
  let progressHandler: ((event: any, data: RemoteVideoCacheProgress) => void) | undefined;

  if (onProgress) {
    progressHandler = (_event: any, data: RemoteVideoCacheProgress) => {
      onProgress(data);
    };
    on("remote-video-cache-progress", progressHandler);
  }

  try {
    return await invoke("remote-video-cache:download-with-progress", payload);
  } finally {
    if (progressHandler) {
      setTimeout(() => {
        off("remote-video-cache-progress", progressHandler!);
      }, 100);
    }
  }
};

export const getRemoteVideoCacheStatus = async (
  url: string
): Promise<RemoteVideoCacheStatus | null> => {
  return await invoke("remote-video-cache:get-status", { url });
};
