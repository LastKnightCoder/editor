import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import useSettingStore from "@/stores/useSettingStore";
import { getNotionBlockInfo } from "@/commands/notion";
import {
  cacheNotionVideo,
  getNotionCacheStatus,
  type NotionCacheProgress,
} from "@/commands/notion-cache";

export interface UseNotionVideoResult {
  videoUrl: string | null;
  loading: boolean;
  error: string | null;
  streamProgress: (NotionCacheProgress & { processed?: number }) | null;
}

interface NotionVideo {
  type: string;
  blockId: string;
}

export function useNotionVideo(
  notionVideo?: NotionVideo,
): UseNotionVideoResult {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] =
    useState<NotionCacheProgress | null>(null);

  const { blockId, type } = notionVideo || {};
  const { setting } = useSettingStore((state) => ({ setting: state.setting }));

  const processNotionVideo = useMemoizedFn(async (blockId: string) => {
    try {
      const token = setting.integration.notion.token;

      // 检查是否有 token
      if (!token || !setting.integration.notion.enabled) {
        setError("请在设置中配置 Notion 集成");
        return;
      }

      // 检查是否已缓存
      const existingCache = await getNotionCacheStatus(blockId);

      if (existingCache) {
        setStreamProgress({
          stage: "completed",
          progress: 100,
          message: "使用本地缓存文件...",
          downloaded: existingCache.fileSize,
          total: existingCache.fileSize,
        });

        setVideoUrl(existingCache.localPath);

        setTimeout(() => {
          setStreamProgress(null);
        }, 2000);

        return;
      }

      // 未缓存，需要下载
      setLoading(true);
      setError(null);
      setStreamProgress({
        stage: "downloading",
        progress: 0,
        message: "正在获取视频信息...",
        downloaded: 0,
        total: 0,
      });

      // 获取视频区块信息
      const blockInfo = await getNotionBlockInfo(token, blockId);

      if (!blockInfo.success || !blockInfo.videoUrl) {
        setError(blockInfo.error || "获取视频信息失败");
        message.error(blockInfo.error || "获取视频信息失败");
        setLoading(false);
        return;
      }

      // 下载并缓存视频
      const cacheResult = await cacheNotionVideo(
        {
          blockId,
          videoUrl: blockInfo.videoUrl,
          title: `Notion 视频 - ${blockId}`,
        },
        (progress) => {
          setStreamProgress(progress);
        },
      );

      setVideoUrl(cacheResult.localPath);

      if (cacheResult.cached) {
        setStreamProgress({
          stage: "completed",
          progress: 100,
          message: `使用缓存文件 (${(cacheResult.fileSize / 1024 / 1024).toFixed(2)}MB)`,
          downloaded: cacheResult.fileSize,
          total: cacheResult.fileSize,
        });
      } else {
        setStreamProgress({
          stage: "completed",
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
      console.error("处理 Notion 视频失败:", error);
      const errorMessage =
        error instanceof Error ? error.message : "处理 Notion 视频失败";
      setError(errorMessage);
      message.error(`Notion 视频加载失败: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (type !== "notion") return;
    if (!blockId) return;

    processNotionVideo(blockId);

    return () => {
      setStreamProgress(null);
    };
  }, [blockId, type, processNotionVideo]);

  return {
    videoUrl,
    loading,
    error,
    streamProgress,
  };
}
