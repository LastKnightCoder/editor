import { invoke, on, off } from "@/electron";
import {
  createScopedAudioProgressHandler,
  getNextAudioCacheRequestId,
} from "./audio-cache-progress";

export interface BilibiliAudioCacheOptions {
  audioUrl: string;
  bvid: string;
  cid: string;
  title?: string;
}

export interface BilibiliAudioCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
  requestId?: number;
}

export interface BilibiliAudioCacheEntry {
  bvid: string;
  cid: string;
  title: string;
  localPath: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

export interface BilibiliAudioCacheProgress {
  requestId?: number;
  stage: "downloading" | "completed" | "error";
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
}

export async function cacheBilibiliAudio(
  options: BilibiliAudioCacheOptions,
  onProgress?: (progress: BilibiliAudioCacheProgress) => void,
): Promise<BilibiliAudioCacheResult> {
  const requestId = getNextAudioCacheRequestId();
  let handler:
    | ((event: any, data: BilibiliAudioCacheProgress) => void)
    | undefined;

  if (onProgress) {
    handler = createScopedAudioProgressHandler(requestId, onProgress);
    on("bilibili-audio-cache-progress", handler);
  }

  try {
    return await invoke("cache_bilibili_audio", {
      options: { ...options, requestId },
    });
  } finally {
    if (handler) {
      setTimeout(() => {
        off("bilibili-audio-cache-progress", handler!);
      }, 100);
    }
  }
}

export { createScopedAudioProgressHandler } from "./audio-cache-progress";

export async function getBilibiliAudioCacheStatus(
  bvid: string,
  cid: string,
): Promise<BilibiliAudioCacheResult | null> {
  return await invoke("get_bilibili_audio_cache_status", { bvid, cid });
}

export async function clearBilibiliAudioCache(): Promise<void> {
  return await invoke("clear_bilibili_audio_cache");
}

export async function listBilibiliAudioCache(): Promise<
  BilibiliAudioCacheEntry[]
> {
  return await invoke("list_bilibili_audio_cache");
}

export async function deleteBilibiliAudioCache(
  bvid: string,
  cid: string,
): Promise<boolean> {
  return await invoke("delete_bilibili_audio_cache", { bvid, cid });
}
