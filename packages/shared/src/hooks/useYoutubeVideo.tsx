import { createContext, useContext, useEffect, useState, useRef } from 'react';

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
  type?: 'video' | 'audio';
}

export interface UseYoutubeVideoResult {
  videoUrl: string | null;
  loading: boolean;
  error: string | null;
  streamProgress: StreamProgress | null;
}

export interface StreamOption {
  id: string;
  resolution: string;
  format: string;
  fps?: number;
  codecs?: string;
  bitrate?: number;
  size?: string;
  videoOnly: boolean;
  audioOnly: boolean;
}

export interface YouTubeVideoMetaInfo {
  type: 'youtube';
  url: string;
  videoStream?: StreamOption | string;
  audioStream?: StreamOption | string;
}

// Platform-agnostic progress type
export interface YoutubeCacheProgress {
  progress: number;
  stage: string;
  message?: string;
  downloaded?: number;
  total?: number;
  videoDownloaded?: number;
  audioDownloaded?: number;
  videoTotal?: number;
  audioTotal?: number;
  type?: 'video' | 'audio';
}

// Dependency injection interface
export interface UseYoutubeVideoDeps {
  getProxy: () => Promise<{ proxy?: string; enabled: boolean }>;
  getCacheStatus: (
    url: string
  ) => Promise<{ cached: boolean; localPath?: string; fileSize?: number } | null>;
  cacheVideo: (
    options: {
      url: string;
      videoStream: StreamOption;
      audioStream: StreamOption;
      proxy?: string;
    },
    onProgress?: (progress: YoutubeCacheProgress) => void
  ) => Promise<{ localPath: string; fileSize: number }>;
  convertFileSrc: (path: string) => Promise<string> | string;
  showError: (message: string) => void;
}

// Base hook with explicit dependencies
export function useYoutubeVideo(
  meta?: YouTubeVideoMetaInfo,
  deps?: UseYoutubeVideoDeps
): UseYoutubeVideoResult {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<StreamProgress | null>(null);
  const initedRef = useRef(false);

  useEffect(() => {
    if (!deps) {
      console.warn('useYoutubeVideo: deps not provided');
      return;
    }

    if (!meta || meta.type !== 'youtube' || initedRef.current) return;
    initedRef.current = true;

    const processVideo = async () => {
      try {
        setLoading(true);
        setError(null);

        const { url, videoStream: rawVideoStream, audioStream: rawAudioStream } = meta;

        // Convert string streams to StreamOption objects if needed
        const videoStream: StreamOption | undefined = rawVideoStream
          ? typeof rawVideoStream === 'string'
            ? { id: rawVideoStream, resolution: 'unknown', format: 'unknown', videoOnly: false, audioOnly: false }
            : rawVideoStream
          : undefined;

        const audioStream: StreamOption | undefined = rawAudioStream
          ? typeof rawAudioStream === 'string'
            ? { id: rawAudioStream, resolution: 'unknown', format: 'unknown', videoOnly: false, audioOnly: true }
            : rawAudioStream
          : undefined;

        // Validate required streams
        if (!videoStream || !audioStream) {
          setError('视频流或音频流信息缺失');
          deps.showError('YouTube 视频加载失败: 视频流或音频流信息缺失');
          return;
        }

        // Check if already cached
        const cached = await deps.getCacheStatus(url);
        if (cached && cached.localPath) {
          const convertedUrl =
            typeof deps.convertFileSrc === 'function'
              ? await deps.convertFileSrc(cached.localPath)
              : cached.localPath;
          setVideoUrl(convertedUrl);
          setStreamProgress({
            downloaded: cached.fileSize || 0,
            total: cached.fileSize || 0,
            processed: 100,
            stage: 'completed',
          });
          setTimeout(() => setStreamProgress(null), 1200);
          return;
        }

        setStreamProgress({
          downloaded: 0,
          total: 0,
          processed: 0,
          stage: 'downloading',
          message: '开始下载视频和音频...',
        });

        // Get proxy settings
        const proxySettings = await deps.getProxy();

        // Cache the video
        const result = await deps.cacheVideo(
          {
            url,
            videoStream,
            audioStream,
            proxy: proxySettings.proxy,
          },
          (progress) => {
            const next: StreamProgress = {
              downloaded: progress.downloaded || 0,
              total: progress.total || 0,
              processed: progress.progress || 0,
              stage: progress.stage,
              message: progress.message,
              videoDownloaded: progress.videoDownloaded,
              audioDownloaded: progress.audioDownloaded,
              videoTotal: progress.videoTotal,
              audioTotal: progress.audioTotal,
              type: progress.type,
            };

            if (progress.stage === 'downloading') {
              if (progress.type === 'video') {
                setStreamProgress((prev) => {
                  if (!prev) return next;
                  return {
                    ...prev,
                    stage: next.stage,
                    message: next.message,
                    processed: next.processed,
                    videoDownloaded: next.videoDownloaded,
                    videoTotal: next.videoTotal,
                  };
                });
                return;
              } else if (progress.type === 'audio') {
                setStreamProgress((prev) => {
                  if (!prev) return next;
                  return {
                    ...prev,
                    stage: next.stage,
                    message: next.message,
                    processed: next.processed,
                    audioDownloaded: next.audioDownloaded,
                    audioTotal: next.audioTotal,
                  };
                });
                return;
              }
            }

            setStreamProgress(next);
          }
        );

        const convertedUrl =
          typeof deps.convertFileSrc === 'function'
            ? await deps.convertFileSrc(result.localPath)
            : result.localPath;
        setVideoUrl(convertedUrl);
        setStreamProgress({
          downloaded: result.fileSize,
          total: result.fileSize,
          processed: 100,
          stage: 'completed',
        });
        setTimeout(() => setStreamProgress(null), 1200);
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : '下载失败';
        setError(msg);
        deps.showError(`YouTube 视频加载失败: ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    processVideo();

    return () => setStreamProgress(null);
  }, [meta?.url, meta?.videoStream, meta?.audioStream, meta?.type, deps]);

  return { videoUrl, loading, error, streamProgress };
}

// Context for dependency injection
const YoutubeVideoDepsContext = createContext<UseYoutubeVideoDeps | null>(null);

// Convenience hook that gets deps from context
export function useYoutubeVideoWithContext(
  meta?: YouTubeVideoMetaInfo
): UseYoutubeVideoResult {
  const deps = useContext(YoutubeVideoDepsContext);
  if (!deps) {
    throw new Error(
      'useYoutubeVideoWithContext must be used within YoutubeVideoDepsProvider'
    );
  }
  return useYoutubeVideo(meta, deps);
}

// Provider component
export function YoutubeVideoDepsProvider({
  children,
  deps,
}: {
  children: React.ReactNode;
  deps: UseYoutubeVideoDeps;
}) {
  return (
    <YoutubeVideoDepsContext.Provider value={deps}>
      {children}
    </YoutubeVideoDepsContext.Provider>
  );
}
