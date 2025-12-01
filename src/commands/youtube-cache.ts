import { invoke, on, off } from "@/electron";
import type { StreamOption, YoutubeVideoInfo } from "@/types/youtube";
export interface YoutubeCacheOptions {
  url: string;
  videoStream: StreamOption;
  audioStream: StreamOption;
  proxy?: string;
}

export interface YoutubeCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
  requestId?: number;
}

export interface YoutubeCacheProgress {
  requestId?: number;
  stage: "downloading" | "merging" | "completed" | "error";
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
  videoDownloaded?: number;
  audioDownloaded?: number;
  videoTotal?: number;
  audioTotal?: number;
  totalSize?: number;
  type?: "video" | "audio";
}

export async function cacheYoutubeVideo(
  options: YoutubeCacheOptions,
  onProgress?: (progress: YoutubeCacheProgress) => void,
): Promise<YoutubeCacheResult> {
  let handler: ((event: any, data: YoutubeCacheProgress) => void) | undefined;
  if (onProgress) {
    handler = (_e, data) => onProgress(data);
    on("youtube-cache-progress", handler);
  }
  try {
    return await invoke("cache_youtube_video", { options });
  } finally {
    if (handler) off("youtube-cache-progress", handler);
  }
}

export async function getYoutubeCacheStatus(
  url: string,
): Promise<{ localPath: string; fileSize: number } | null> {
  return await invoke("get_youtube_cache_status", { url });
}

export async function clearYoutubeCache(): Promise<void> {
  return await invoke("clear_youtube_cache");
}

export interface DeleteYoutubeCacheOptions {
  url?: string;
  localPath?: string;
}

export async function deleteYoutubeCache(
  params: DeleteYoutubeCacheOptions,
): Promise<boolean> {
  return await invoke("delete_youtube_cache", params);
}

export async function getYoutubeCacheSize(): Promise<number> {
  return await invoke("get_youtube_cache_size");
}

export async function listYoutubeCache(): Promise<
  Array<{
    url: string;
    title: string;
    localPath: string;
    fileSize: number;
    createdAt: string;
    lastAccessed: string;
  }>
> {
  return await invoke("list_youtube_cache");
}

export async function getYoutubeVideoInfo(
  url: string,
  proxy?: string,
): Promise<YoutubeVideoInfo | null> {
  return await invoke("get_youtube_video_info", { url, proxy });
}
