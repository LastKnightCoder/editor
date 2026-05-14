import { useEffect, useState, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { App } from "antd";
import useSettingStore from "@/stores/useSettingStore";
import {
  youtubeAudioToLocal,
  isYoutubeAudioCached,
} from "@/utils/youtube-audio-cache";
import type { StreamOption } from "@/types/youtube";

export interface AudioCacheProgress {
  downloaded: number;
  total: number;
  progress: number;
  stage: string;
  message?: string;
}

export interface UseYoutubeAudioResult {
  audioUrl: string | null;
  loading: boolean;
  error: string | null;
  progress: AudioCacheProgress | null;
}

interface YoutubeAudioMeta {
  type: string;
  url: string;
  audioStream: StreamOption;
}

export function useYoutubeAudio(
  meta?: YoutubeAudioMeta,
): UseYoutubeAudioResult {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AudioCacheProgress | null>(null);
  const initedRef = useRef(false);
  const { message } = App.useApp();

  const { setting } = useSettingStore((s) => ({ setting: s.setting }));

  const processYoutubeAudio = useMemoizedFn(
    async (url: string, audioStream: StreamOption) => {
      try {
        setLoading(true);
        setError(null);

        const isAlreadyCached = await isYoutubeAudioCached(url);
        if (isAlreadyCached) {
          setProgress({
            downloaded: 0,
            total: 0,
            progress: 100,
            stage: "completed",
            message: "使用本地缓存...",
          });
        } else {
          setProgress({
            downloaded: 0,
            total: 0,
            progress: 0,
            stage: "downloading",
            message: "开始下载音频...",
          });
        }

        const result = await youtubeAudioToLocal(
          {
            url,
            audioStream,
            proxy: setting.integration.youtube.proxy,
          },
          (p) => {
            setProgress({
              downloaded: p.downloaded || 0,
              total: p.total || 0,
              progress: p.progress || 0,
              stage: p.stage,
              message: p.message,
            });
          },
        );

        setAudioUrl(result.localUrl);
        setProgress({
          downloaded: result.fileSize,
          total: result.fileSize,
          progress: 100,
          stage: "completed",
          message: result.cached
            ? `使用缓存 (${(result.fileSize / 1024 / 1024).toFixed(1)}MB)`
            : `下载完成 (${(result.fileSize / 1024 / 1024).toFixed(1)}MB)`,
        });
        setTimeout(() => setProgress(null), 2000);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "下载失败";
        setError(msg);
        message.error(`YouTube 音频加载失败: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
  );

  useEffect(() => {
    if (!meta || meta.type !== "youtube" || initedRef.current) return;
    initedRef.current = true;
    processYoutubeAudio(meta.url, meta.audioStream);
    return () => setProgress(null);
  }, [meta?.url, meta?.audioStream, processYoutubeAudio]);

  return { audioUrl, loading, error, progress };
}
