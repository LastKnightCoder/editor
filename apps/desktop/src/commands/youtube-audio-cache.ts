import { invoke, on, off } from "@/electron";
import type { StreamOption } from "@/types/youtube";
import {
  createScopedAudioProgressHandler,
  getNextAudioCacheRequestId,
} from "./audio-cache-progress";

export interface YoutubeAudioCacheOptions {
  url: string;
  audioStream: StreamOption;
  proxy?: string;
}

export interface YoutubeAudioCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
  requestId?: number;
}

export interface YoutubeAudioCacheEntry {
  url: string;
  title: string;
  localPath: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

export interface YoutubeAudioCacheProgress {
  requestId?: number;
  stage: "downloading" | "completed" | "error";
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
}

export async function cacheYoutubeAudio(
  options: YoutubeAudioCacheOptions,
  onProgress?: (progress: YoutubeAudioCacheProgress) => void,
): Promise<YoutubeAudioCacheResult> {
  const requestId = getNextAudioCacheRequestId();
  let handler:
    | ((event: any, data: YoutubeAudioCacheProgress) => void)
    | undefined;

  if (onProgress) {
    handler = createScopedAudioProgressHandler(requestId, onProgress);
    on("youtube-audio-cache-progress", handler);
  }

  try {
    return await invoke("cache_youtube_audio", {
      options: { ...options, requestId },
    });
  } finally {
    if (handler) {
      setTimeout(() => {
        off("youtube-audio-cache-progress", handler!);
      }, 100);
    }
  }
}

export async function getYoutubeAudioCacheStatus(
  url: string,
): Promise<{ localPath: string; fileSize: number } | null> {
  return await invoke("get_youtube_audio_cache_status", { url });
}

export async function clearYoutubeAudioCache(): Promise<void> {
  return await invoke("clear_youtube_audio_cache");
}

export async function listYoutubeAudioCache(): Promise<
  YoutubeAudioCacheEntry[]
> {
  return await invoke("list_youtube_audio_cache");
}

export async function deleteYoutubeAudioCache(url: string): Promise<boolean> {
  return await invoke("delete_youtube_audio_cache", { url });
}
