import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@/commands";
import { ensureOnlineVideo } from "@/commands/online-video-cache";
import { isOnlineVideoType, onlineVideoRef } from "@/types/online-video";
import type { VideoLoaderStreamProgress } from "@/editor-providers/types";
import { useVideoProviders } from "./useVideoProviders";

export interface UseOnlineVideoResult {
  videoUrl: string | null;
  loading: boolean;
  error: string | null;
  streamProgress: VideoLoaderStreamProgress | null;
  retry: () => void;
}

/**
 * 在线视频取源：经提供方插件缓存到本地后返回可播放地址。
 * meta 不是在线视频（本地 / 远程 / 缺省）时不做任何事。
 */
export function useOnlineVideo(meta: object | null | undefined): UseOnlineVideoResult {
  const [state, setState] = useState<Omit<UseOnlineVideoResult, "retry">>({
    videoUrl: null,
    loading: false,
    error: null,
    streamProgress: null,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const fields = meta as Record<string, unknown> | null | undefined;
  const providerId = isOnlineVideoType(fields?.type) ? fields.type : undefined;
  const refKey = useMemo(() => (fields ? JSON.stringify(onlineVideoRef(fields)) : ""), [fields]);
  const title = typeof fields?.title === "string" ? fields.title : undefined;
  const { ready, providers } = useVideoProviders();
  const available = !!providerId && providers.some(provider => provider.id === providerId);

  useEffect(() => {
    if (!providerId) return;
    // 插件随应用启动异步激活：就绪前等待，启用后自动重新取源。
    if (!available) {
      setState({
        videoUrl: null,
        loading: !ready,
        error: ready ? `需要在插件中心安装并启用「${providerId}」插件` : null,
        streamProgress: ready ? null : { stage: "preparing", message: "正在准备…" },
      });
      return;
    }
    const controller = new AbortController();
    setState({
      videoUrl: null,
      loading: true,
      error: null,
      streamProgress: { stage: "preparing", message: "正在获取视频信息…" },
    });
    ensureOnlineVideo(
      { providerId, ref: JSON.parse(refKey), title },
      {
        signal: controller.signal,
        onProgress: progress =>
          setState(current => ({
            ...current,
            streamProgress: { ...current.streamProgress, ...progress },
          })),
      }
    )
      .then(result => convertFileSrc(result.localPath))
      .then(videoUrl => {
        if (!controller.signal.aborted)
          setState({ videoUrl, loading: false, error: null, streamProgress: null });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setState({
          videoUrl: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          streamProgress: null,
        });
      });
    return () => controller.abort();
  }, [providerId, available, ready, refKey, title, attempt]);

  return { ...state, retry };
}
