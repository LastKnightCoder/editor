import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { getPlayUrl, checkStreamAvailability } from "@/utils/bilibili";
import {
  bilibiliVideoToLocal,
  isBilibiliVideoCached,
} from "@/utils/bilibili-cache";
import { message } from "antd";
import useSettingStore from "@/stores/useSettingStore";

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
}

interface BilibiliVideo {
  type: string;
  bvid: string;
  cid: string;
  quality?: number;
}

export function useBilibiliVideo(
  bilibiliVideo: BilibiliVideo,
): UseBilibiliVideoResult {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<StreamProgress | null>(
    null,
  );

  const { bvid, cid, quality, type } = bilibiliVideo || {};

  const { setting } = useSettingStore((state) => ({ setting: state.setting }));

  const processBilibiliVideo = useMemoizedFn(async (bvid, cid, quality) => {
    try {
      const credentials = setting.integration.bilibili.credentials;

      // 检查是否有凭证
      if (!credentials.SESSDATA && setting.integration.bilibili.enabled) {
        setError("请在设置中配置 Bilibili 凭证信息");
        return;
      }

      const playUrls = await getPlayUrl(
        cid,
        bvid,
        quality || 80, // 使用用户选择的清晰度，默认 1080P
        credentials,
      );

      // 检查流可用性
      const availability = await checkStreamAvailability(playUrls);
      if (!availability.videoAvailable || !availability.audioAvailable) {
        setError("视频流不可用，可能需要大会员权限或视频已失效");
        return;
      }

      const selectedQuality = quality || 80;

      const isAlreadyCached = await isBilibiliVideoCached(
        bvid,
        cid,
        selectedQuality,
      );

      if (isAlreadyCached) {
        setStreamProgress({
          downloaded: 0,
          total: 0,
          processed: 100,
          stage: "completed",
          message: "使用本地缓存文件...",
        });
      } else {
        setLoading(true);
        setError(null);
        setStreamProgress({
          downloaded: 0,
          total: 0,
          processed: 0,
          stage: "downloading",
          message: "开始下载并缓存 Bilibili 视频...",
        });
      }

      // 使用本地缓存系统处理视频
      const localVideoResult = await bilibiliVideoToLocal(
        {
          videoUrl: playUrls.video,
          audioUrl: playUrls.audio,
          bvid: bvid,
          cid: cid,
          quality: selectedQuality,
          title: `${bvid}-${cid}`,
        },
        (progress) => {
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
          };

          if (progress.stage === "downloading") {
            if (progress.type === "video") {
              setStreamProgress((prev) => {
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
              setStreamProgress((prev) => {
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
        },
      );

      console.log("localVideoResult", localVideoResult);
      setVideoUrl(localVideoResult.localUrl);

      if (localVideoResult.cached) {
        setStreamProgress({
          downloaded: localVideoResult.fileSize,
          total: localVideoResult.fileSize,
          processed: 100,
          stage: "completed",
          message: `使用缓存文件 (${(localVideoResult.fileSize / 1024 / 1024).toFixed(2)}MB)`,
        });
      } else {
        setStreamProgress({
          downloaded: localVideoResult.fileSize,
          total: localVideoResult.fileSize,
          processed: 100,
          stage: "completed",
          message: `下载完成 (${(localVideoResult.fileSize / 1024 / 1024).toFixed(2)}MB)`,
        });
      }

      setTimeout(() => {
        setStreamProgress(null);
      }, 2000);
    } catch (error) {
      console.error("处理 Bilibili 视频失败:", error);
      const errorMessage =
        error instanceof Error ? error.message : "处理 Bilibili 视频失败";
      setError(errorMessage);
      message.error(`Bilibili 视频加载失败: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (type !== "bilibili") return;
    processBilibiliVideo(bvid, cid, quality);

    return () => {
      setStreamProgress(null);
    };
  }, [bvid, cid, quality, processBilibiliVideo]);

  return {
    videoUrl,
    loading,
    error,
    streamProgress,
  };
}
