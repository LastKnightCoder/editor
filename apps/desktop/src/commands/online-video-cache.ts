import type { VideoRef } from "@tau/plugins";
import { invoke, off, on } from "@/electron";
import { withModule } from "./module-init";
import type { OnlineVideoCacheProgress, OnlineVideoCacheResult } from "../../shared/video-renderer";

export interface OnlineVideoTarget {
  providerId: string;
  ref: VideoRef;
  title?: string;
}

const module = <T>(run: () => Promise<T>) => withModule("online-video-cache", run);

/** 确保在线视频已缓存到本地，返回本地文件路径；进度按本次请求过滤。 */
export function ensureOnlineVideo(
  target: OnlineVideoTarget,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: OnlineVideoCacheProgress) => void;
  } = {}
): Promise<OnlineVideoCacheResult> {
  return module(async () => {
    options.signal?.throwIfAborted();
    const requestId = crypto.randomUUID();
    const listener = (_event: unknown, progress: OnlineVideoCacheProgress) => {
      if (progress.requestId === requestId) options.onProgress?.(progress);
    };
    const cancel = () => {
      void invoke("online-video-cache:cancel", requestId).catch(() => undefined);
    };
    on("online-video-cache:progress", listener);
    options.signal?.addEventListener("abort", cancel, { once: true });
    try {
      const result = await invoke<OnlineVideoCacheResult>(
        "online-video-cache:ensure",
        requestId,
        target
      );
      options.signal?.throwIfAborted();
      return result;
    } finally {
      off("online-video-cache:progress", listener);
      options.signal?.removeEventListener("abort", cancel);
    }
  });
}

export const getOnlineVideoCacheStatus = (target: OnlineVideoTarget) =>
  module(() => invoke<OnlineVideoCacheResult | null>("online-video-cache:status", target));

export interface OnlineVideoCacheEntry {
  id: string;
  providerId: string;
  title: string;
  localPath: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

export const listOnlineVideoCache = () =>
  module(() => invoke<OnlineVideoCacheEntry[]>("online-video-cache:list"));

export const deleteOnlineVideoCache = (id: string) =>
  module(() => invoke<boolean>("online-video-cache:delete", id));

export const clearOnlineVideoCache = () => module(() => invoke<void>("online-video-cache:clear"));
