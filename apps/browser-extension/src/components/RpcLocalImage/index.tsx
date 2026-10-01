import React, { forwardRef, useState, useCallback } from "react";
import { useAsyncEffect } from "ahooks";
import type WebSocketClient from "../../utils/WebSocketClient";

interface RpcLocalImageProps {
  url: string;
  wsClient: WebSocketClient | null;
  /** 回退到原始地址后仍失败时回调 */
  onLoadError?: () => void;
}

type RpcLocalImageElementProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src">;

type RpcLocalImageCombinedProps = RpcLocalImageProps & RpcLocalImageElementProps;

/**
 * 浏览器扩展版本的 LocalImage 组件
 * 通过 RPC 调用桌面端的文件服务
 */
const RpcLocalImage = forwardRef<HTMLImageElement, RpcLocalImageCombinedProps>((props, ref) => {
  const { url, alt, className, style, onClick, wsClient, onLoadError, ...restProps } = props;

  const [previewUrl, setPreviewUrl] = useState<string>();
  const [isConverting, setIsConverting] = useState(true);

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
    setIsConverting(true);
    try {
      if (!url) {
        setPreviewUrl(undefined);
        return;
      }

      // 直接可用的 URL
      if (
        url.startsWith("data:") ||
        url.startsWith("blob:") ||
        url.startsWith("http://localhost")
      ) {
        setPreviewUrl(url);
        return;
      }

      // 远程 URL
      if (url.startsWith("http")) {
        // 浏览器扩展中直接使用远程 URL，不做本地缓存
        setPreviewUrl(url);
        return;
      }

      // 本地路径，通过 RPC 转换
      if (!wsClient?.isConnected) {
        setPreviewUrl(url);
        return;
      }

      try {
        // 处理 ~ 开头的路径
        let absolutePath = url;
        if (url.startsWith("~")) {
          const { homeDir } = await rpc<{ homeDir: string }>("file.getHomeDir", {});
          absolutePath = `${homeDir}${url.slice(1)}`;
        }

        const { url: fileSrcUrl } = await rpc<{ url: string }>("file.convertFileSrc", {
          path: absolutePath,
        });
        setPreviewUrl(fileSrcUrl);
      } catch (error) {
        console.error("[RpcLocalImage] 转换失败:", error);
        setPreviewUrl(url);
      }
    } catch (e) {
      console.error("[RpcLocalImage] 错误:", e);
      setPreviewUrl(url);
    } finally {
      setIsConverting(false);
    }
  }, [url, wsClient?.isConnected, rpc]);

  const onError = useCallback(() => {
    if (previewUrl !== url) {
      setPreviewUrl(url);
      return;
    }
    onLoadError?.();
  }, [onLoadError, previewUrl, url]);

  if (isConverting || !previewUrl) return null;

  return (
    <img
      ref={ref}
      src={previewUrl}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      onError={onError}
      loading="lazy"
      {...restProps}
    />
  );
});

RpcLocalImage.displayName = "RpcLocalImage";

export default RpcLocalImage;
