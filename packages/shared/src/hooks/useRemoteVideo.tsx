import { createContext, useContext, useEffect, useState } from 'react';

// Type definitions
export interface RemoteVideoStreamProgress {
  downloaded: number;
  total: number;
  stage: 'downloading' | 'completed' | 'error';
  message?: string;
  percent?: number;
}

export interface UseRemoteVideoResult {
  videoUrl: string | null;
  loading: boolean;
  error: string | null;
  streamProgress: RemoteVideoStreamProgress | null;
}

// Platform-agnostic progress type
export interface RemoteVideoCacheProgress {
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
  getCacheStatus: (url: string) => Promise<{ cached: boolean; localPath?: string; fileSize?: number } | null>;
  showError: (message: string) => void;
  isRemoteUrl: (url: string) => boolean;
}

// Base hook with explicit dependencies
export function useRemoteVideo(
  src?: string,
  deps?: UseRemoteVideoDeps
): UseRemoteVideoResult {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<RemoteVideoStreamProgress | null>(null);

  useEffect(() => {
    if (!deps) {
      console.warn('useRemoteVideo: deps not provided');
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
          console.log('[useRemoteVideo] Video already cached:', cacheStatus.localPath);
          setVideoUrl(cacheStatus.localPath);
          setStreamProgress({
            downloaded: cacheStatus.fileSize || 0,
            total: cacheStatus.fileSize || 0,
            stage: 'completed',
            message: `Using cached file (${((cacheStatus.fileSize || 0) / 1024 / 1024).toFixed(2)}MB)`,
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
          stage: 'downloading',
          message: 'Starting video download...',
          percent: 0,
        });

        // Cache the video with progress
        const result = await deps.cacheVideo(
          { url: src },
          (progress) => {
            setStreamProgress({
              downloaded: progress.downloaded || 0,
              total: progress.total || 0,
              stage: progress.stage as 'downloading' | 'completed' | 'error',
              message: progress.message,
              percent: progress.progress,
            });
          }
        );

        setVideoUrl(result.localUrl);

        setStreamProgress({
          downloaded: result.fileSize,
          total: result.fileSize,
          stage: 'completed',
          message: result.cached
            ? `Using cached file (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`
            : `Download completed (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`,
          percent: 100,
        });

        setTimeout(() => {
          setStreamProgress(null);
        }, 2000);
      } catch (err) {
        console.error('Failed to process remote video:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to download video';
        setError(errorMessage);
        deps.showError(`Video download failed: ${errorMessage}`);

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
  }, [src, deps]);

  return {
    videoUrl,
    loading,
    error,
    streamProgress,
  };
}

// Context for dependency injection
const RemoteVideoDepsContext = createContext<UseRemoteVideoDeps | null>(null);

// Convenience hook that gets deps from context
export function useRemoteVideoWithContext(src?: string): UseRemoteVideoResult {
  const deps = useContext(RemoteVideoDepsContext);
  if (!deps) {
    throw new Error(
      'useRemoteVideoWithContext must be used within RemoteVideoDepsProvider'
    );
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
  return (
    <RemoteVideoDepsContext.Provider value={deps}>
      {children}
    </RemoteVideoDepsContext.Provider>
  );
}
