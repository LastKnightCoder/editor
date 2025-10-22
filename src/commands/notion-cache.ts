import { invoke, on, off } from "@/electron";

export interface NotionCacheOptions {
  blockId: string;
  videoUrl: string;
  title?: string;
}

export interface NotionCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
  requestId?: number;
}

export interface NotionCacheProgress {
  requestId?: number;
  stage: "downloading" | "completed" | "error";
  progress: number;
  processed?: number;
  message: string;
  downloaded?: number;
  total?: number;
}

export async function cacheNotionVideo(
  options: NotionCacheOptions,
  onProgress?: (progress: NotionCacheProgress) => void,
): Promise<NotionCacheResult> {
  let progressHandler:
    | ((event: any, data: NotionCacheProgress) => void)
    | undefined;
  let result: NotionCacheResult;

  if (onProgress) {
    progressHandler = (_event: any, data: NotionCacheProgress) => {
      onProgress(data);
    };

    on("notion-cache-progress", progressHandler);
  }

  try {
    result = await invoke("cache_notion_video", { options });
    return result;
  } finally {
    if (progressHandler) {
      setTimeout(() => {
        off("notion-cache-progress", progressHandler!);
      }, 100);
    }
  }
}

export async function getNotionCacheStatus(
  blockId: string,
): Promise<NotionCacheResult | null> {
  return await invoke("get_notion_cache_status", { blockId });
}

export async function clearNotionCache(): Promise<void> {
  return await invoke("clear_notion_cache");
}

export async function deleteNotionCache(blockId: string): Promise<boolean> {
  return await invoke("delete_notion_cache", { blockId });
}

export async function getNotionCacheSize(): Promise<number> {
  return await invoke("get_notion_cache_size");
}

export async function listNotionCache(): Promise<
  Array<{
    blockId: string;
    title: string;
    fileSize: number;
    createdAt: string;
    lastAccessed: string;
  }>
> {
  return await invoke("list_notion_cache");
}
