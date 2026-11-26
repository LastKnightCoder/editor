import { useVideoSelectorI18n } from "@/services/video-selector.i18n";
import { videoSelectionFailureText } from "@/services/video-selector.binding";
import { VideoSelectionFailure } from "@/services/video-selector-error";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedVideo, VideoRef } from "@tau/plugins";
import { callPluginVideo, getVideoProviders } from "@/commands/plugin-video";

export interface OnlineVideoSelection {
  url: string;
  providerId: string;
  providerName: string;
  title: string;
  cover?: string;
  ref: VideoRef;
}

interface Resolved extends ResolvedVideo {
  url: string;
  providerId: string;
  providerName: string;
}

const providerName = (providerId: string) =>
  getVideoProviders().providers.find(provider => provider.id === providerId)?.name ?? providerId;

/** 粘贴视频链接 → 由指定的视频插件解析 → 选择清晰度，供各添加入口共用。 */
export function useOnlineVideoResolver(providerId: string) {
  useVideoSelectorI18n();
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [variant, setVariant] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setAnalyzing(false);
    setError(null);
    setResolved(null);
    setVariant(0);
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  const analyze = useCallback(
    async (input: string) => {
      const url = input.trim();
      try {
        new URL(url);
      } catch (cause) {
        setError(new VideoSelectionFailure("invalid", {}, { cause }));
        return;
      }
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setAnalyzing(true);
      setError(null);
      try {
        const matched = await callPluginVideo(
          { kind: "match", url, pluginId: providerId },
          current.signal
        );
        if (!matched) {
          // 链接属于另一个已启用的插件时指明正确入口
          const other = await callPluginVideo({ kind: "match", url }, current.signal);
          setError(
            new VideoSelectionFailure(other ? "otherProvider" : "unsupported", {
              provider: providerName(other || providerId),
            })
          );
          return;
        }
        const info = await callPluginVideo(
          { kind: "resolve", pluginId: providerId, url },
          current.signal
        );
        setResolved({ ...info, url, providerId, providerName: providerName(providerId) });
        const preferred = info.defaultVariant ?? 0;
        setVariant(preferred >= 0 && preferred < info.variants.length ? preferred : 0);
      } catch (caught) {
        if (current.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught
            : new VideoSelectionFailure("resolve", {}, { cause: caught })
        );
      } finally {
        if (controller.current === current) {
          controller.current = null;
          setAnalyzing(false);
        }
      }
    },
    [providerId]
  );

  const selection = useCallback((): OnlineVideoSelection | null => {
    if (!resolved) return null;
    const chosen = resolved.variants[variant];
    if (!chosen) return null;
    return {
      url: resolved.url,
      providerId: resolved.providerId,
      providerName: resolved.providerName,
      title: resolved.title,
      cover: resolved.cover,
      ref: chosen.ref,
    };
  }, [resolved, variant]);

  return {
    analyzing,
    error: error === null ? null : videoSelectionFailureText(error),
    setError,
    resolved,
    variant,
    setVariant,
    analyze,
    reset,
    selection,
  };
}
