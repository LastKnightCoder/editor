import { useRemoteVideoI18n } from "./remote-video-i18n";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface VideoProgressSemantic {
  code?: string;
  params?: Record<string, string | number | boolean | null>;
  fraction?: number;
}

// Type definitions
export interface RemoteVideoStreamProgress extends VideoProgressSemantic {
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
  /** 失败后重新取源 */
  retry: () => void;
}

// Platform-agnostic progress type
export interface RemoteVideoCacheProgress extends VideoProgressSemantic {
  progress: number;
  stage: string;
  message?: string;
  downloaded?: number;
  total?: number;
}

// Dependency injection interface - only what this hook needs
export interface UseRemoteVideoDeps {
  cacheVideo: (
    options: {
      url: string;
      fileName?: string;
    },
    onProgress?: (progress: RemoteVideoCacheProgress) => void
  ) => Promise<{ localUrl: string; fileSize: number; cached: boolean }>;
  getCacheStatus: (
    url: string
  ) => Promise<{ cached: boolean; localPath?: string; fileSize?: number } | null>;
  showError: (message: string) => void;
  errorText?: (error: unknown) => string | undefined;
  isRemoteUrl: (url: string) => boolean;
}

type ErrorPresentation = {
  t: ReturnType<typeof useRemoteVideoI18n>["t"];
  deps?: Pick<UseRemoteVideoDeps, "errorText">;
};
const errorMessage = (error: unknown, presentation: ErrorPresentation) =>
  presentation.deps?.errorText?.(error) ??
  (error instanceof Error ? error.message : presentation.t("error.fallback"));

// Base hook with explicit dependencies
export function useRemoteVideo(src?: string, deps?: UseRemoteVideoDeps): UseRemoteVideoResult {
  const { t } = useRemoteVideoI18n();
  const presentation = useRef<ErrorPresentation>({ t, deps });
  presentation.current = { t, deps };
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ cause: unknown } | null>(null);
  const [streamProgress, setStreamProgress] = useState<RemoteVideoStreamProgress | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!deps) {
      console.warn("useRemoteVideo: deps not provided");
      return;
    }

    if (!src) return;

    // Only handle remote URLs
    if (!deps.isRemoteUrl(src)) {
      setVideoUrl(src);
      return;
    }

    const processVideo = async () => {
      try {
        // Check if already cached
        const cacheStatus = await deps.getCacheStatus(src);

        if (cacheStatus?.cached && cacheStatus.localPath) {
          console.log("[useRemoteVideo] Video already cached:", cacheStatus.localPath);
          setVideoUrl(cacheStatus.localPath);
          setStreamProgress({
            downloaded: cacheStatus.fileSize || 0,
            total: cacheStatus.fileSize || 0,
            stage: "completed",
            message: `Using cached file (${((cacheStatus.fileSize || 0) / 1024 / 1024).toFixed(2)}MB)`,
            code: "video.remote.cached",
            params: { fileSize: cacheStatus.fileSize || 0 },
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
          message: "Starting video download...",
          code: "video.remote.start",
          percent: 0,
        });

        // Cache the video with progress
        const result = await deps.cacheVideo({ url: src }, progress => {
          setStreamProgress({
            downloaded: progress.downloaded || 0,
            total: progress.total || 0,
            stage: progress.stage as "downloading" | "completed" | "error",
            message: progress.message,
            code: progress.code,
            params: progress.params,
            fraction: progress.fraction,
            percent: progress.progress,
          });
        });

        setVideoUrl(result.localUrl);

        setStreamProgress({
          downloaded: result.fileSize,
          total: result.fileSize,
          stage: "completed",
          code: result.cached ? "video.remote.cached" : "video.remote.completed",
          params: { fileSize: result.fileSize },
          message: result.cached
            ? `Using cached file (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`
            : `Download completed (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`,
          percent: 100,
        });

        setTimeout(() => {
          setStreamProgress(null);
        }, 2000);
      } catch (err) {
        console.error("Failed to process remote video:", err);
        setError({ cause: err });
        deps.showError(
          presentation.current.t("error.notice", { error: errorMessage(err, presentation.current) })
        );

        // Fallback to original URL on error
        setVideoUrl(src);
      } finally {
        setLoading(false);
      }
    };

    processVideo();

    return () => {
      setStreamProgress(null);
    };
  }, [src, deps, attempt]);

  return {
    videoUrl,
    loading,
    error: error ? errorMessage(error.cause, presentation.current) : null,
    streamProgress,
    retry,
  };
}

// Context for dependency injection
const RemoteVideoDepsContext = createContext<UseRemoteVideoDeps | null>(null);

// Convenience hook that gets deps from context
export function useRemoteVideoWithContext(src?: string): UseRemoteVideoResult {
  const deps = useContext(RemoteVideoDepsContext);
  if (!deps) {
    throw new Error("useRemoteVideoWithContext must be used within RemoteVideoDepsProvider");
  }
  return useRemoteVideo(src, deps);
}

// Provider component
export function RemoteVideoDepsProvider({
  children,
  deps,
}: {
  children: React.ReactNode;
  deps: UseRemoteVideoDeps;
}) {
  return <RemoteVideoDepsContext.Provider value={deps}>{children}</RemoteVideoDepsContext.Provider>;
}
