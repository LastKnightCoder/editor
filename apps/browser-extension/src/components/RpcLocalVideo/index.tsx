import React, { forwardRef, useState, useRef, useEffect, useCallback, memo } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import type WebSocketClient from "../../utils/WebSocketClient";
import { VideoPlayer, type VideoPlayerProps } from "@tau/shared";

interface RpcLocalVideoProps {
  src: string;
  wsClient: WebSocketClient | null;
}

type RpcLocalVideoElementProps = Omit<VideoPlayerProps, "src">;

type RpcLocalVideoCombinedProps = RpcLocalVideoProps & RpcLocalVideoElementProps;

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "video/ogg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
}

/**
 * 浏览器扩展版本的 LocalVideo 组件
 * 通过 RPC 调用桌面端的文件服务
 */
const RpcLocalVideo = memo(
  forwardRef<HTMLVideoElement, RpcLocalVideoCombinedProps>((props, ref) => {
    const { src, wsClient, ...rest } = props;

    const [previewUrl, setPreviewUrl] = useState<string>("");
    const videoTitle = typeof rest?.title === "string" ? (rest.title as string) : undefined;

    const innerRef = useRef<HTMLVideoElement>(null);
    const currentTime = useRef(0);
    const playStatus = useRef(false);
    const currentMethod = useRef("default");

    const getVideoElement = useMemoizedFn(() => {
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
      [wsClient]
    );

    useAsyncEffect(async () => {
      try {
        if (!src) {
          setPreviewUrl("");
          currentMethod.current = "default";
          return;
        }

        // 直接可用的 URL
        if (
          src.startsWith("data:") ||
          src.startsWith("blob:") ||
          src.startsWith("http://localhost")
        ) {
          setPreviewUrl(src);
          currentMethod.current = "default";
          return;
        }

        // 远程 URL
        if (src.startsWith("http")) {
          // 浏览器扩展中直接使用远程 URL
          setPreviewUrl(src);
          currentMethod.current = "default";
          return;
        }

        // 本地路径，通过 RPC 转换
        if (!wsClient?.isConnected) {
          setPreviewUrl(src);
          currentMethod.current = "default";
          return;
        }

        try {
          // 处理 ~ 开头的路径
          let absolutePath = src;
          if (src.startsWith("~")) {
            const { homeDir } = await rpc<{ homeDir: string }>("file.getHomeDir", {});
            absolutePath = `${homeDir}${src.slice(1)}`;
          }

          // 获取应用目录
          const { editorDir } = await rpc<{ editorDir: string }>("file.getEditorDir", {});
          const normalizedAppDir = editorDir.replace(/\\/g, "/");
          const normalizedPath = absolutePath.replace(/\\/g, "/");

          // 如果在应用目录内，使用 convertFileSrc
          if (normalizedPath.startsWith(normalizedAppDir)) {
            const { url } = await rpc<{ url: string }>("file.convertFileSrc", {
              path: absolutePath,
            });
            setPreviewUrl(url);
            currentMethod.current = "localhost";
          } else {
            // 否则读取二进制文件
            const { base64 } = await rpc<{ base64: string }>("file.readBinaryFile", {
              path: absolutePath,
            });
            const { extension } = await rpc<{ extension: string }>("file.getFileExtension", {
              path: absolutePath,
            });

            // 将 base64 转换为 Blob URL
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: getMimeType(extension) });
            const blobUrl = URL.createObjectURL(blob);
            setPreviewUrl(blobUrl);
            currentMethod.current = "read-file";
          }

          // 保存当前播放状态
          const videoElement = getVideoElement();
          if (videoElement) {
            currentTime.current = videoElement.currentTime;
            playStatus.current = !videoElement.paused;
          }
        } catch (error) {
          console.error("[RpcLocalVideo] 转换失败:", error);
          setPreviewUrl(src);
          currentMethod.current = "default";
        }
      } catch (e) {
        console.error("[RpcLocalVideo] 错误:", e);
        setPreviewUrl(src);
        currentMethod.current = "default";
      }
    }, [src, wsClient?.isConnected, rpc, getVideoElement]);

    // 恢复播放位置
    useEffect(() => {
      const videoElement = getVideoElement();
      if (videoElement && previewUrl) {
        videoElement.currentTime = currentTime.current;
        if (playStatus.current) {
          videoElement.play().catch(() => {});
        }
      }
    }, [previewUrl, getVideoElement]);

    const handleOnError = useMemoizedFn(async () => {
      // 错误时回退到原始 URL
      if (currentMethod.current !== "default") {
        setPreviewUrl(src);
        currentMethod.current = "default";
      }
    });

    const videoRef = ref || innerRef;

    if (!previewUrl) {
      return null;
    }

    return (
      <VideoPlayer
        ref={videoRef}
        onError={handleOnError}
        src={previewUrl}
        crossOrigin="anonymous"
        persistKey={src}
        {...rest}
      />
    );
  })
);

RpcLocalVideo.displayName = "RpcLocalVideo";

export default RpcLocalVideo;
