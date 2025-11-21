import React, { forwardRef, useState } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { convertFileSrc, getHomeDir } from "@/commands";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";

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
    const cdnUrl = useGithubCdnUrl(url) || url;

    const [previewUrl, setPreviewUrl] = useState<string>();
    const [isConverting, setIsConverting] = useState(true);

    useAsyncEffect(async () => {
      setIsConverting(true);
      try {
        if (!cdnUrl) {
          setPreviewUrl(undefined);
          return;
        }

        if (
          cdnUrl.startsWith("data:") ||
          cdnUrl.startsWith("blob:") ||
          cdnUrl.startsWith("http://localhost")
        ) {
          setPreviewUrl(cdnUrl);
          return;
        }

        if (cdnUrl.startsWith("http")) {
          try {
            const localUrl = await remoteResourceToLocal(cdnUrl);
            const filePath = await convertFileSrc(localUrl);
            setPreviewUrl(filePath);
          } catch (error) {
            console.error(error);
            setPreviewUrl(cdnUrl);
          }
          return;
        }

        const homeDir = await getHomeDir();
        const absolutePath = cdnUrl.startsWith("~")
          ? `${homeDir}${cdnUrl.slice(1)}`
          : cdnUrl;
        const filePath = await convertFileSrc(absolutePath);
        setPreviewUrl(filePath);
      } catch (e) {
        console.error(e);
        setPreviewUrl(cdnUrl);
      } finally {
        setIsConverting(false);
      }
    }, [cdnUrl]);

    const onError = useMemoizedFn(() => {
      console.log("onError", cdnUrl);
      setPreviewUrl(cdnUrl);
    });

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
  },
);

export default LocalImage;
