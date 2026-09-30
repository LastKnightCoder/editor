import { forwardRef, useState, useRef, useCallback, memo } from "react";
import { useAsyncEffect } from "ahooks";
import type WebSocketClient from "../../utils/WebSocketClient";
import { AudioPlayer, type AudioPlayerProps } from "@tau/shared";

interface RpcLocalAudioProps {
  src: string;
  wsClient: WebSocketClient | null;
}

type RpcLocalAudioElementProps = Omit<AudioPlayerProps, "src">;

type RpcLocalAudioCombinedProps = RpcLocalAudioProps & RpcLocalAudioElementProps;

/**
 * 浏览器扩展版本的 LocalAudio 组件
 * 通过 RPC 调用桌面端的文件服务
 */
const RpcLocalAudio = memo(
  forwardRef<HTMLAudioElement, RpcLocalAudioCombinedProps>((props, ref) => {
    const { src, wsClient, ...rest } = props;

    const [previewUrl, setPreviewUrl] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const innerRef = useRef<HTMLAudioElement>(null);

    const rpc = useCallback(
      async <T,>(method: string, params: unknown): Promise<T> => {
        if (!wsClient?.isConnected) {
          throw new Error("WebSocket 未连接");
        }
        return wsClient.sendRequest(method, params) as Promise<T>;
      },
      [wsClient]
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
            const { homeDir } = await rpc<{ homeDir: string }>("file.getHomeDir", {});
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

    const audioRef = ref || innerRef;

    // 解析期间以空 src 渲染，播放器保留卡片占位显示加载态
    return (
      <AudioPlayer
        ref={audioRef}
        src={loading ? "" : previewUrl}
        crossOrigin="anonymous"
        persistKey={src}
        {...rest}
      />
    );
  })
);

RpcLocalAudio.displayName = "RpcLocalAudio";

export default RpcLocalAudio;
