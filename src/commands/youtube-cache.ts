import { invoke, on, off } from "@/electron";
import ytdl from "@distube/ytdl-core";

export interface YoutubeCacheOptions {
  videoId: string;
  videoFormat: ytdl.videoFormat;
  audioFormat: ytdl.videoFormat;
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
  videoId: string,
  quality?: string,
): Promise<{ localPath: string; fileSize: number } | null> {
  return await invoke("get_youtube_cache_status", { videoId, quality });
}

export async function clearYoutubeCache(): Promise<void> {
  return await invoke("clear_youtube_cache");
}

export async function deleteYoutubeCache(
  videoId: string,
  quality?: string,
): Promise<boolean> {
  return await invoke("delete_youtube_cache", { videoId, quality });
}

export async function getYoutubeCacheSize(): Promise<number> {
  return await invoke("get_youtube_cache_size");
}

export async function listYoutubeCache(): Promise<
  Array<{
    videoId: string;
    quality?: string;
    title: string;
    fileSize: number;
    createdAt: string;
    lastAccessed: string;
  }>
> {
  return await invoke("list_youtube_cache");
}

export async function getYoutubeVideoInfo(
  videoId: string,
  proxy?: string,
): Promise<{
  audioFmts: ytdl.videoFormat[];
  videoFmts: ytdl.videoFormat[];
  videoId: string;
  title: string;
} | null> {
  return await invoke("get_youtube_video_info", { videoId, proxy });
}
