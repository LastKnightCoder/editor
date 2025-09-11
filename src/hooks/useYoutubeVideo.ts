import { useEffect, useState, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import useSettingStore from "@/stores/useSettingStore";
import {
  cacheYoutubeVideo,
  getYoutubeCacheStatus,
  convertFileSrc,
} from "@/commands";
import ytdl from "@distube/ytdl-core";

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
  type?: "video" | "audio";
}

export interface UseYoutubeVideoResult {
  videoUrl: string | null;
  loading: boolean;
  error: string | null;
  streamProgress: StreamProgress | null;
}

interface YoutubeVideoMeta {
  type: "youtube";
  videoId: string;
  videoFormat: ytdl.videoFormat;
  audioFormat: ytdl.videoFormat;
}

export function useYoutubeVideo(
  meta?: YoutubeVideoMeta,
): UseYoutubeVideoResult {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<StreamProgress | null>(
    null,
  );
  const initedRef = useRef(false);

  const { setting } = useSettingStore((s) => ({ setting: s.setting }));

  const processYoutube = useMemoizedFn(
    async (
      videoId: string,
      videoFormat: ytdl.videoFormat,
      audioFormat: ytdl.videoFormat,
    ) => {
      try {
        setLoading(true);
        setError(null);

        const cached = await getYoutubeCacheStatus(
          videoId,
          videoFormat.quality,
        );
        if (cached && cached.localPath) {
          const url = await convertFileSrc(cached.localPath);
          setVideoUrl(url);
          setStreamProgress({
            downloaded: cached.fileSize,
            total: cached.fileSize,
            processed: 100,
            stage: "completed",
          });
          setTimeout(() => setStreamProgress(null), 1200);
          return;
        }

        setStreamProgress({
          downloaded: 0,
          total: 0,
          processed: 0,
          stage: "downloading",
          message: "开始下载视频和音频...",
        });

        const result = await cacheYoutubeVideo(
          {
            videoId,
            videoFormat,
            audioFormat,
            proxy: setting.integration.youtube.proxy,
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

            if (progress.stage === "downloading") {
              if (progress.type === "video") {
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
              } else if (progress.type === "audio") {
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
          },
        );

        const url = await convertFileSrc(result.localPath);
        setVideoUrl(url);
        setStreamProgress({
          downloaded: result.fileSize,
          total: result.fileSize,
          processed: 100,
          stage: "completed",
        });
        setTimeout(() => setStreamProgress(null), 1200);
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : "下载失败";
        setError(msg);
        message.error(`YouTube 视频加载失败: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
  );

  useEffect(() => {
    if (!meta || meta.type !== "youtube" || initedRef.current) return;
    initedRef.current = true;
    processYoutube(meta.videoId, meta.videoFormat, meta.audioFormat);
    return () => setStreamProgress(null);
  }, [meta?.videoId, meta?.videoFormat, meta?.audioFormat, processYoutube]);

  return { videoUrl, loading, error, streamProgress };
}
