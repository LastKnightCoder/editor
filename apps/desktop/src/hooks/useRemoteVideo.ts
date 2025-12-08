import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import {
  downloadRemoteVideoWithProgress,
  getRemoteVideoCacheStatus,
  type RemoteVideoCacheProgress,
} from "@/commands/remote-video-cache";
import { convertFileSrc } from "@/commands";

export interface RemoteVideoStreamProgress {
  downloaded: number;
  total: number;
  stage: "downloading" | "completed" | "error";
  message?: string;
  percent?: number;
}

export interface UseRemoteVideoResult {
  videoUrl: string | null;
  loading: boolean;
  error: string | null;
  streamProgress: RemoteVideoStreamProgress | null;
}

/**
 * Check if a URL is a remote HTTP(S) URL
 */
function isRemoteUrl(url: string): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Hook to download and cache remote video with progress
 */
export function useRemoteVideo(src?: string): UseRemoteVideoResult {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] =
    useState<RemoteVideoStreamProgress | null>(null);

  const processRemoteVideo = useMemoizedFn(async (url: string) => {
    try {
      // Check if already cached
      const cacheStatus = await getRemoteVideoCacheStatus(url);

      if (cacheStatus?.cached && cacheStatus.localPath) {
        console.log("[useRemoteVideo] Video already cached:", cacheStatus.localPath);
        const localUrl = await convertFileSrc(cacheStatus.localPath);
        setVideoUrl(localUrl);
        setStreamProgress({
          downloaded: cacheStatus.fileSize || 0,
          total: cacheStatus.fileSize || 0,
          stage: "completed",
          message: `使用缓存文件 (${((cacheStatus.fileSize || 0) / 1024 / 1024).toFixed(2)}MB)`,
          percent: 100,
        });

        setTimeout(() => {
          setStreamProgress(null);
        }, 2000);

        return;
      }

      // Not cached, start download
      setLoading(true);
      setError(null);
      setStreamProgress({
        downloaded: 0,
        total: 0,
        stage: "downloading",
        message: "正在准备下载...",
        percent: 0,
      });

      // Download with progress
      const result = await downloadRemoteVideoWithProgress(
        { url },
        (progress: RemoteVideoCacheProgress) => {
          setStreamProgress({
            downloaded: progress.downloaded || 0,
            total: progress.total || 0,
            stage: progress.stage,
            message: progress.message,
            percent: progress.progress,
          });
        },
      );

      const localUrl = await convertFileSrc(result.localPath);
      setVideoUrl(localUrl);

      setStreamProgress({
        downloaded: result.fileSize,
        total: result.fileSize,
        stage: "completed",
        message: result.cached
          ? `使用缓存文件 (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`
          : `下载完成 (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`,
        percent: 100,
      });

      setTimeout(() => {
        setStreamProgress(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to download remote video:", err);
      const errorMessage =
        err instanceof Error ? err.message : "视频下载失败";
      setError(errorMessage);
      message.error(`视频下载失败: ${errorMessage}`);

      // Fallback to original URL on error
      setVideoUrl(src || null);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (!src) {
      setVideoUrl(null);
      return;
    }

    // Only process remote URLs
    if (!isRemoteUrl(src)) {
      setVideoUrl(src);
      return;
    }

    processRemoteVideo(src);

    return () => {
      setStreamProgress(null);
    };
  }, [src, processRemoteVideo]);

  return {
    videoUrl,
    loading,
    error,
    streamProgress,
  };
}
