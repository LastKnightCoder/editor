import React, { useState, forwardRef } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { convertFileSrc } from "@/commands";

interface ILocalImageProps {
  url: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  [key: string]: any;
}

const LocalImage = forwardRef<HTMLImageElement, ILocalImageProps>(
  (props, ref) => {
    const { url, alt, className, style, onClick, ...restProps } = props;

    const [previewUrl, setPreviewUrl] = useState(url);
    const [isConverting, setIsConverting] = useState(false);

    useAsyncEffect(async () => {
      setIsConverting(true);
      try {
        // 如果是 base64 或 blob url，直接使用
        if (url.startsWith("data:") || url.startsWith("blob:")) {
          return;
        }

        if (url.startsWith("http")) {
          const localUrl = await remoteResourceToLocal(url);
          const filePath = convertFileSrc(localUrl);
          setPreviewUrl(filePath);
        } else {
          const filePath = convertFileSrc(url);
          setPreviewUrl(filePath);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsConverting(false);
      }
    }, [url]);

    const onError = useMemoizedFn(() => {
      setPreviewUrl(url);
    });

    if (isConverting) return null;

    return (
      <img
        ref={ref}
        src={previewUrl}
        alt={alt}
        className={className}
        style={style}
        onClick={onClick}
        onError={onError}
        {...restProps}
      />
    );
  },
);

export default LocalImage;
