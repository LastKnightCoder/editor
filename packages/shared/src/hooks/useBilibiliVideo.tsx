import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Type definitions
export interface StreamProgress {
  downloaded: number;
  total: number;
  processed: number;
  stage: string;
  message?: string;
  videoDownloaded?: number;
  audioDownloaded?: number;
  videoTotal?: number;
  audioTotal?: number;
  type?: string;
}

export interface UseBilibiliVideoResult {
  videoUrl: string | null;
  loading: boolean;
  error: string | null;
  streamProgress: StreamProgress | null;
  /** 失败后重新取源 */
  retry: () => void;
}

export interface BiliBiliVideoMetaInfo {
  type: string;
  bvid: string;
  cid: string;
  quality?: number;
}

// Platform-agnostic progress type
export interface BilibiliCacheProgress {
  progress: number;
  stage: string;
  message?: string;
  videoDownloaded?: number;
  audioDownloaded?: number;
  videoTotal?: number;
  audioTotal?: number;
  totalSize?: number;
  type?: string;
}

// Dependency injection interface - only what this hook needs
export interface UseBilibiliVideoDeps {
  getCredentials: () => Promise<{ SESSDATA: string; enabled: boolean }>;
  getPlayUrl: (
    cid: string,
    bvid: string,
    quality: number,
    credentials: any
  ) => Promise<{ video: string; audio: string }>;
  checkStreamAvailability: (urls: {
    video: string;
    audio: string;
  }) => Promise<{ videoAvailable: boolean; audioAvailable: boolean }>;
  cacheVideo: (
    options: {
      videoUrl: string;
      audioUrl: string;
      bvid: string;
      cid: string;
      quality: number;
      title: string;
    },
    onProgress?: (progress: BilibiliCacheProgress) => void
  ) => Promise<{ localUrl: string; fileSize: number; cached: boolean }>;
  getCacheStatus: (bvid: string, cid: string, quality: number) => Promise<boolean>;
  showError: (message: string) => void;
}

// Base hook with explicit dependencies
export function useBilibiliVideo(
  meta?: BiliBiliVideoMetaInfo,
  deps?: UseBilibiliVideoDeps
): UseBilibiliVideoResult {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<StreamProgress | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  const { bvid, cid, quality, type } = meta || {};

  useEffect(() => {
    if (!deps) {
      console.warn("useBilibiliVideo: deps not provided");
      return;
    }

    if (type !== "bilibili") return;
    if (!bvid || !cid) return;

    const processVideo = async () => {
      try {
        const credentials = await deps.getCredentials();

        // Check credentials
        if (!credentials.SESSDATA && credentials.enabled) {
          setError("请在设置中配置 Bilibili 凭证信息");
          deps.showError("请在设置中配置 Bilibili 凭证信息");
          return;
        }

        const selectedQuality = quality || 80;

        // Check if already cached
        const isAlreadyCached = await deps.getCacheStatus(bvid, cid, selectedQuality);

        if (isAlreadyCached) {
          // 已缓存，直接获取本地路径，不需要获取 B站播放链接
          console.log("[useBilibiliVideo] 视频已缓存，直接获取本地路径", {
            bvid,
            cid,
            quality: selectedQuality,
          });

          setStreamProgress({
            downloaded: 0,
            total: 0,
            processed: 100,
            stage: "completed",
            message: "使用本地缓存文件...",
          });

          // 直接调用 cacheVideo 获取本地 URL（会立即返回缓存路径）
          const result = await deps.cacheVideo(
            {
              videoUrl: "", // 已缓存时不需要
              audioUrl: "", // 已缓存时不需要
              bvid: bvid,
              cid: cid,
              quality: selectedQuality,
              title: `${bvid}-${cid}`,
            },
            () => {} // 已缓存时不需要进度回调
          );

          console.log("[useBilibiliVideo] 获取到本地 URL:", result.localUrl);

          setVideoUrl(result.localUrl);
          setStreamProgress({
            downloaded: result.fileSize,
            total: result.fileSize,
            processed: 100,
            stage: "completed",
            message: `使用缓存文件 (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`,
          });

          setTimeout(() => {
            setStreamProgress(null);
          }, 2000);

          return; // 已缓存，直接返回
        }

        // 未缓存，开始下载流程
        setLoading(true);
        setError(null);
        setStreamProgress({
          downloaded: 0,
          total: 0,
          processed: 0,
          stage: "downloading",
          message: "开始下载并缓存 Bilibili 视频...",
        });

        // Get play URLs
        const playUrls = await deps.getPlayUrl(cid, bvid, selectedQuality, credentials);

        // Check stream availability
        const availability = await deps.checkStreamAvailability(playUrls);
        if (!availability.videoAvailable || !availability.audioAvailable) {
          const errorMsg = "视频流不可用，可能需要大会员权限或视频已失效";
          setError(errorMsg);
          deps.showError(errorMsg);
          return;
        }

        // Cache the video
        const result = await deps.cacheVideo(
          {
            videoUrl: playUrls.video,
            audioUrl: playUrls.audio,
            bvid: bvid,
            cid: cid,
            quality: selectedQuality,
            title: `${bvid}-${cid}`,
          },
          progress => {
            const streamProgress: StreamProgress = {
              downloaded: progress.videoDownloaded || 0,
              total: progress.videoTotal || progress.totalSize || 0,
              processed: progress.progress,
              stage: progress.stage,
              message: progress.message,
              videoDownloaded: progress.videoDownloaded,
              audioDownloaded: progress.audioDownloaded,
              videoTotal: progress.videoTotal,
              audioTotal: progress.audioTotal,
              type: progress.type,
            };

            if (progress.stage === "downloading") {
              if (progress.type === "video") {
                setStreamProgress(prev => {
                  if (!prev) {
                    return streamProgress;
                  }
                  return {
                    ...prev,
                    videoDownloaded: progress.videoDownloaded,
                    videoTotal: progress.videoTotal,
                  };
                });
                return;
              } else if (progress.type === "audio") {
                setStreamProgress(prev => {
                  if (!prev) {
                    return streamProgress;
                  }
                  return {
                    ...prev,
                    audioDownloaded: progress.audioDownloaded,
                    audioTotal: progress.audioTotal,
                  };
                });
                return;
              }
            }

            setStreamProgress(streamProgress);
          }
        );

        setVideoUrl(result.localUrl);

        if (result.cached) {
          setStreamProgress({
            downloaded: result.fileSize,
            total: result.fileSize,
            processed: 100,
            stage: "completed",
            message: `使用缓存文件 (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`,
          });
        } else {
          setStreamProgress({
            downloaded: result.fileSize,
            total: result.fileSize,
            processed: 100,
            stage: "completed",
            message: `下载完成 (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`,
          });
        }

        setTimeout(() => {
          setStreamProgress(null);
        }, 2000);
      } catch (error) {
        console.error("处理 Bilibili 视频失败:", error);
        const errorMessage = error instanceof Error ? error.message : "处理 Bilibili 视频失败";
        setError(errorMessage);
        deps.showError(`Bilibili 视频加载失败: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    };

    processVideo();

    return () => {
      setStreamProgress(null);
    };
  }, [bvid, cid, quality, type, deps, attempt]);

  return {
    videoUrl,
    loading,
    error,
    streamProgress,
    retry,
  };
}

// Context for dependency injection
const BilibiliVideoDepsContext = createContext<UseBilibiliVideoDeps | null>(null);

// Convenience hook that gets deps from context
export function useBilibiliVideoWithContext(meta?: BiliBiliVideoMetaInfo): UseBilibiliVideoResult {
  const deps = useContext(BilibiliVideoDepsContext);
  if (!deps) {
    throw new Error("useBilibiliVideoWithContext must be used within BilibiliVideoDepsProvider");
  }
  return useBilibiliVideo(meta, deps);
}

// Provider component
export function BilibiliVideoDepsProvider({
  children,
  deps,
}: {
  children: React.ReactNode;
  deps: UseBilibiliVideoDeps;
}) {
  return (
    <BilibiliVideoDepsContext.Provider value={deps}>{children}</BilibiliVideoDepsContext.Provider>
  );
}
