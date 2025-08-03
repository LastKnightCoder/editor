import { invoke, on, off } from "@/electron";

export interface BilibiliCacheOptions {
  videoUrl: string;
  audioUrl: string;
  bvid: string;
  cid: string;
  quality: number;
  title?: string;
}

export interface BilibiliCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
  requestId?: number;
}

export interface BilibiliCacheProgress {
  requestId?: number;
  stage: "downloading" | "merging" | "completed" | "error";
  progress: number;
  message: string;
  videoDownloaded?: number;
  audioDownloaded?: number;
  videoTotal?: number;
  audioTotal?: number;
  totalSize?: number;
}

export async function cacheBilibiliVideo(
  options: BilibiliCacheOptions,
  onProgress?: (progress: BilibiliCacheProgress) => void,
): Promise<BilibiliCacheResult> {
  let progressHandler:
    | ((event: any, data: BilibiliCacheProgress) => void)
    | undefined;
  let result: BilibiliCacheResult;

  if (onProgress) {
    // 设置进度监听器（需要在调用前设置）
    progressHandler = (_event: any, data: BilibiliCacheProgress) => {
      // 由于此时还没有 requestId，先暂存所有事件
      onProgress(data);
    };

    on("bilibili-cache-progress", progressHandler);
  }

  try {
    result = await invoke("cache_bilibili_video", { options });
    return result;
  } finally {
    if (progressHandler) {
      // 延迟一下再清理，确保最后的事件能被处理
      setTimeout(() => {
        off("bilibili-cache-progress", progressHandler!);
      }, 100);
    }
  }
}

export async function getBilibiliCacheStatus(
  bvid: string,
  cid: string,
  quality: number,
): Promise<BilibiliCacheResult | null> {
  return await invoke("get_bilibili_cache_status", {
    bvid,
    cid,
    quality,
  });
}

export async function clearBilibiliCache(): Promise<void> {
  return await invoke("clear_bilibili_cache");
}

export async function deleteBilibiliCache(
  bvid: string,
  cid: string,
  quality: number,
): Promise<boolean> {
  return await invoke("delete_bilibili_cache", { bvid, cid, quality });
}

export async function getBilibiliCacheSize(): Promise<number> {
  return await invoke("get_bilibili_cache_size");
}

export async function listBilibiliCache(): Promise<
  Array<{
    bvid: string;
    cid: string;
    quality: number;
    title: string;
    fileSize: number;
    createdAt: string;
    lastAccessed: string;
  }>
> {
  return await invoke("list_bilibili_cache");
}
