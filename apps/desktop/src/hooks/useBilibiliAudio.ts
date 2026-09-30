import { useEffect, useState, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import { getPlayUrl, checkStreamAvailability } from "@/utils/bilibili";
import {
  bilibiliAudioToLocal,
  isBilibiliAudioCached,
} from "@/utils/bilibili-audio-cache";
import useSettingStore from "@/stores/useSettingStore";

export interface AudioCacheProgress {
  downloaded: number;
  total: number;
  progress: number;
  stage: string;
  message?: string;
}

export interface UseBilibiliAudioResult {
  audioUrl: string | null;
  loading: boolean;
  error: string | null;
  progress: AudioCacheProgress | null;
}

interface BilibiliAudioMeta {
  type: string;
  bvid: string;
  cid: string;
  quality?: number;
}

export function useBilibiliAudio(
  meta?: BilibiliAudioMeta,
): UseBilibiliAudioResult {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AudioCacheProgress | null>(null);
  const initedRef = useRef(false);

  const { setting } = useSettingStore((s) => ({ setting: s.setting }));

  const processBilibiliAudio = useMemoizedFn(
    async (bvid: string, cid: string, quality?: number) => {
      try {
        setLoading(true);
        setError(null);

        const credentials = setting.integration.bilibili.credentials;

        const isAlreadyCached = await isBilibiliAudioCached(bvid, cid);
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
            message: "正在获取音频地址...",
          });
        }

        const playUrls = await getPlayUrl(
          cid,
          bvid,
          quality || 80,
          credentials,
        );

        const availability = await checkStreamAvailability(playUrls);
        if (!availability.audioAvailable) {
          setError("音频流不可用，可能需要大会员权限或视频已失效");
          return;
        }

        const result = await bilibiliAudioToLocal(
          {
            audioUrl: playUrls.audio,
            bvid,
            cid,
            title: `${bvid}-${cid}`,
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
        const msg = e instanceof Error ? e.message : "处理 Bilibili 音频失败";
        setError(msg);
        toast.error(`Bilibili 音频加载失败: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
  );

  useEffect(() => {
    if (!meta || meta.type !== "bilibili" || initedRef.current) return;
    initedRef.current = true;
    processBilibiliAudio(meta.bvid, meta.cid, meta.quality);
    return () => setProgress(null);
  }, [meta?.bvid, meta?.cid, meta?.quality, processBilibiliAudio]);

  return { audioUrl, loading, error, progress };
}
