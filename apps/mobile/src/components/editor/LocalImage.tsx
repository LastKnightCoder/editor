import { forwardRef, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { resolveLocalMediaSource } from "./localMedia";

type LocalImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  url: string;
  /** 列表等小图场景：走后端缩略图通道，避免全尺寸图经 base64 IPC */
  thumbnail?: boolean;
  /** 回退到原始地址后仍失败时回调 */
  onLoadError?: () => void;
};

const LocalImage = forwardRef<HTMLImageElement, LocalImageProps>(
  ({ url, thumbnail = false, onError, onLoadError, ...restProps }, ref) => {
    const [resolvedUrl, setResolvedUrl] = useState(url);

    useEffect(() => {
      let cancelled = false;
      setResolvedUrl(url);

      void (async () => {
        try {
          const nextUrl = await resolveLocalMediaSource(url, { thumbnail });
          if (!cancelled) {
            setResolvedUrl(nextUrl);
          }
        } catch (error) {
          console.error("[mobile-local-image] resolve failed", error);
          if (!cancelled) {
            setResolvedUrl(url);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [url, thumbnail]);

    const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
      if (resolvedUrl !== url) {
        setResolvedUrl(url);
      } else {
        onLoadError?.();
      }
      onError?.(event);
    };

    return (
      <img ref={ref} src={resolvedUrl || url} loading="lazy" onError={handleError} {...restProps} />
    );
  }
);

LocalImage.displayName = "LocalImage";

export default LocalImage;
