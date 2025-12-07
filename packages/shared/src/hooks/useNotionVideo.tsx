import { createContext, useContext, useEffect, useState } from 'react';

// Type definitions
export interface NotionCacheProgress {
  stage: string;
  progress: number;
  message?: string;
  downloaded?: number;
  total?: number;
}

export interface UseNotionVideoResult {
  videoUrl: string | null;
  loading: boolean;
  error: string | null;
  streamProgress: (NotionCacheProgress & { processed?: number }) | null;
}

export interface NotionVideoMetaInfo {
  type: string;
  blockId: string;
  cache?: boolean;
}

// Dependency injection interface
export interface UseNotionVideoDeps {
  getToken: () => Promise<{ token: string; enabled: boolean }>;
  getBlockInfo: (
    token: string,
    blockId: string
  ) => Promise<{ success: boolean; videoUrl?: string; error?: string }>;
  getCacheStatus: (
    blockId: string
  ) => Promise<{ cached: boolean; localPath?: string; fileSize?: number } | null>;
  cacheVideo: (
    options: {
      blockId: string;
      videoUrl: string;
      title: string;
    },
    onProgress?: (progress: NotionCacheProgress) => void
  ) => Promise<{ localPath: string; fileSize: number; cached: boolean }>;
  showError: (message: string) => void;
}

// Base hook with explicit dependencies
export function useNotionVideo(
  meta?: NotionVideoMetaInfo,
  deps?: UseNotionVideoDeps
): UseNotionVideoResult {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<NotionCacheProgress | null>(null);

  const { blockId, type, cache = true } = meta || {};

  useEffect(() => {
    if (!deps) {
      console.warn('useNotionVideo: deps not provided');
      return;
    }

    if (type !== 'notion') return;
    if (!blockId) return;

    const processVideo = async () => {
      try {
        const tokenInfo = await deps.getToken();

        // Check if token is available
        if (!tokenInfo.token || !tokenInfo.enabled) {
          setError('请在设置中配置 Notion 集成');
          return;
        }

        // If no cache, directly get video URL and return
        if (!cache) {
          setLoading(true);
          setError(null);
          setStreamProgress({
            stage: 'downloading',
            progress: 0,
            message: '正在获取视频信息...',
            downloaded: 0,
            total: 0,
          });

          // Get video block info
          const blockInfo = await deps.getBlockInfo(tokenInfo.token, blockId);

          if (!blockInfo.success || !blockInfo.videoUrl) {
            const errorMsg = blockInfo.error || '获取视频信息失败';
            setError(errorMsg);
            deps.showError(errorMsg);
            setLoading(false);
            return;
          }

          // Use online URL directly, no caching
          setVideoUrl(blockInfo.videoUrl);

          setStreamProgress({
            stage: 'completed',
            progress: 100,
            message: '视频链接获取完成',
            downloaded: 1,
            total: 1,
          });

          setTimeout(() => {
            setStreamProgress(null);
          }, 2000);

          setLoading(false);
          return;
        }

        // Cache mode: check if already cached
        const existingCache = await deps.getCacheStatus(blockId);

        if (existingCache && existingCache.localPath) {
          setStreamProgress({
            stage: 'completed',
            progress: 100,
            message: '使用本地缓存文件...',
            downloaded: existingCache.fileSize || 0,
            total: existingCache.fileSize || 0,
          });

          setVideoUrl(existingCache.localPath);

          setTimeout(() => {
            setStreamProgress(null);
          }, 2000);

          return;
        }

        // Not cached, need to download
        setLoading(true);
        setError(null);
        setStreamProgress({
          stage: 'downloading',
          progress: 0,
          message: '正在获取视频信息...',
          downloaded: 0,
          total: 0,
        });

        // Get video block info
        const blockInfo = await deps.getBlockInfo(tokenInfo.token, blockId);

        if (!blockInfo.success || !blockInfo.videoUrl) {
          const errorMsg = blockInfo.error || '获取视频信息失败';
          setError(errorMsg);
          deps.showError(errorMsg);
          setLoading(false);
          return;
        }

        // Download and cache video
        const cacheResult = await deps.cacheVideo(
          {
            blockId,
            videoUrl: blockInfo.videoUrl,
            title: `Notion 视频 - ${blockId}`,
          },
          (progress) => {
            setStreamProgress(progress);
          }
        );

        setVideoUrl(cacheResult.localPath);

        if (cacheResult.cached) {
          setStreamProgress({
            stage: 'completed',
            progress: 100,
            message: `使用缓存文件 (${(cacheResult.fileSize / 1024 / 1024).toFixed(2)}MB)`,
            downloaded: cacheResult.fileSize,
            total: cacheResult.fileSize,
          });
        } else {
          setStreamProgress({
            stage: 'completed',
            progress: 100,
            message: `下载完成 (${(cacheResult.fileSize / 1024 / 1024).toFixed(2)}MB)`,
            downloaded: cacheResult.fileSize,
            total: cacheResult.fileSize,
          });
        }

        setTimeout(() => {
          setStreamProgress(null);
        }, 2000);
      } catch (error) {
        console.error('处理 Notion 视频失败:', error);
        const errorMessage =
          error instanceof Error ? error.message : '处理 Notion 视频失败';
        setError(errorMessage);
        deps.showError(`Notion 视频加载失败: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    };

    processVideo();

    return () => {
      setStreamProgress(null);
    };
  }, [blockId, type, cache, deps]);

  return {
    videoUrl,
    loading,
    error,
    streamProgress,
  };
}

// Context for dependency injection
const NotionVideoDepsContext = createContext<UseNotionVideoDeps | null>(null);

// Convenience hook that gets deps from context
export function useNotionVideoWithContext(
  meta?: NotionVideoMetaInfo
): UseNotionVideoResult {
  const deps = useContext(NotionVideoDepsContext);
  if (!deps) {
    throw new Error(
      'useNotionVideoWithContext must be used within NotionVideoDepsProvider'
    );
  }
  return useNotionVideo(meta, deps);
}

// Provider component
export function NotionVideoDepsProvider({
  children,
  deps,
}: {
  children: React.ReactNode;
  deps: UseNotionVideoDeps;
}) {
  return (
    <NotionVideoDepsContext.Provider value={deps}>
      {children}
    </NotionVideoDepsContext.Provider>
  );
}
