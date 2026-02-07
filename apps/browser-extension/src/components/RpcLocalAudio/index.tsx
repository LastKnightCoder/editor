import React, {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
} from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import type WebSocketClient from "../../utils/WebSocketClient";

interface RpcLocalAudioProps {
  src: string;
  wsClient: WebSocketClient | null;
  [key: string]: unknown;
}

const AUDIO_POSITION_PREFIX = "audio_position_";

/**
 * 浏览器扩展版本的 LocalAudio 组件
 * 通过 RPC 调用桌面端的文件服务
 */
const RpcLocalAudio = memo(
  forwardRef<HTMLAudioElement, RpcLocalAudioProps>((props, ref) => {
    const { src, wsClient, ...rest } = props;

    const [previewUrl, setPreviewUrl] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const innerRef = useRef<HTMLAudioElement>(null);

    const getAudioElement = useMemoizedFn(() => {
      if (typeof ref === "function") {
        return null;
      } else if (ref && ref.current) {
        return ref.current;
      } else {
        return innerRef.current;
      }
    });

    const rpc = useCallback(
      async <T,>(method: string, params: unknown): Promise<T> => {
        if (!wsClient?.isConnected) {
          throw new Error("WebSocket 未连接");
        }
        return wsClient.sendRequest(method, params) as Promise<T>;
      },
      [wsClient],
    );

    useAsyncEffect(async () => {
      setLoading(true);
      try {
        if (!src) {
          setPreviewUrl("");
          return;
        }

        // 直接可用的 URL
        if (src.startsWith("data:") || src.startsWith("blob:")) {
          setPreviewUrl(src);
          return;
        }

        // 远程 URL
        if (src.startsWith("http")) {
          // 浏览器扩展中直接使用远程 URL
          setPreviewUrl(src);
          return;
        }

        // 本地路径，通过 RPC 转换
        if (!wsClient?.isConnected) {
          setPreviewUrl(src);
          return;
        }

        try {
          // 处理 ~ 开头的路径
          let absolutePath = src;
          if (src.startsWith("~")) {
            const { homeDir } = await rpc<{ homeDir: string }>(
              "file.getHomeDir",
              {},
            );
            absolutePath = `${homeDir}${src.slice(1)}`;
          }

          const { url } = await rpc<{ url: string }>("file.convertFileSrc", {
            path: absolutePath,
          });
          setPreviewUrl(url);
        } catch (error) {
          console.error("[RpcLocalAudio] 转换失败:", error);
          setPreviewUrl(src);
        }
      } catch (e) {
        console.error("[RpcLocalAudio] 错误:", e);
        setPreviewUrl(src);
      } finally {
        setLoading(false);
      }
    }, [src, wsClient?.isConnected, rpc]);

    // 播放位置记忆
    useEffect(() => {
      const audio = getAudioElement();
      if (!audio || loading) return;

      const storageKey = `${AUDIO_POSITION_PREFIX}${src}`;

      const handleLoadedMetadata = () => {
        const savedPosition = localStorage.getItem(storageKey);
        if (savedPosition) {
          const position = parseFloat(savedPosition);
          if (!isNaN(position) && position >= 0 && position < audio.duration) {
            audio.currentTime = position;
          }
        }
      };

      const handleTimeUpdate = () => {
        if (audio.currentTime >= 0) {
          localStorage.setItem(storageKey, audio.currentTime.toString());
        }
      };

      const handleEnded = () => {
        localStorage.removeItem(storageKey);
      };

      audio.addEventListener("loadedmetadata", handleLoadedMetadata);
      audio.addEventListener("timeupdate", handleTimeUpdate);
      audio.addEventListener("ended", handleEnded);

      return () => {
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("ended", handleEnded);
      };
    }, [src, loading, getAudioElement]);

    const audioRef = ref || innerRef;

    if (loading || !previewUrl) return null;

    return (
      <audio
        ref={audioRef}
        src={previewUrl}
        crossOrigin="anonymous"
        {...rest}
      />
    );
  }),
);

RpcLocalAudio.displayName = "RpcLocalAudio";

export default RpcLocalAudio;
