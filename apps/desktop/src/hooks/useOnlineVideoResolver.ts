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
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      } catch {
        setError("请输入有效的视频链接");
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
            other
              ? `该链接属于「${providerName(other)}」，请从对应入口添加`
              : `「${providerName(providerId)}」无法识别该链接`
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
        setError(caught instanceof Error ? caught.message : "解析失败，请稍后重试");
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
    error,
    setError,
    resolved,
    variant,
    setVariant,
    analyze,
    reset,
    selection,
  };
}
