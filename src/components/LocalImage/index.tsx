import React, { forwardRef, useMemo, useState } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { convertFileSrc, getHomeDir } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import { EGithubCDN } from "@/constants/github.ts";

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
    const github = useSettingStore((state) => state.setting.imageBed.github);
    const { cdn } = github;

    const cdnUrl = useMemo(() => {
      // 如果是 https://github.com/{{owner}}/{{repo}}/raw/{{branch}}/{{path}}
      // 或者 https://raw.githubusercontent.com/{{owner}}/{{repo}}/{{branch}}/{{path}}
      // 并且配置了 Github CDN，则使用 CDN 地址
      if (!cdn || !url) return url;

      // 正则匹配
      const match1 = url.match(
        /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/([^/]+)$/,
      );
      const match2 = url.match(
        /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/,
      );

      if (cdn === EGithubCDN.JsDelivr) {
        if (match1) {
          return `https://cdn.jsdelivr.net/gh/${match1[1]}/${match1[2]}@${match1[3]}/${match1[4]}`;
        }
        if (match2) {
          return `https://cdn.jsdelivr.net/gh/${match2[1]}/${match2[2]}@${match2[3]}/${match2[4]}`;
        }
      } else if (cdn === EGithubCDN.Statically) {
        if (match1) {
          return `https://cdn.statically.io/gh/${match1[1]}/${match1[2]}/@${match1[3]}/${match1[4]}`;
        }
        if (match2) {
          return `https://cdn.statically.io/gh/${match2[1]}/${match2[2]}/@${match2[3]}/${match2[4]}`;
        }
      }

      return url;
    }, [url, cdn]);

    const [previewUrl, setPreviewUrl] = useState(cdnUrl);
    const [isConverting, setIsConverting] = useState(false);

    useAsyncEffect(async () => {
      setIsConverting(true);
      try {
        // 如果是 base64 或 blob url，直接使用
        if (
          !cdnUrl ||
          cdnUrl.startsWith("data:") ||
          cdnUrl.startsWith("blob:")
        ) {
          return;
        }

        if (cdnUrl.startsWith("http")) {
          const localUrl = await remoteResourceToLocal(cdnUrl);
          const filePath = convertFileSrc(localUrl);
          setPreviewUrl(filePath);
        } else {
          const homeDir = await getHomeDir();
          const absolutePath = cdnUrl.startsWith("~")
            ? `${homeDir}${cdnUrl.slice(1)}`
            : cdnUrl;
          const filePath = convertFileSrc(absolutePath);
          setPreviewUrl(filePath);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsConverting(false);
      }
    }, [cdnUrl]);

    const onError = useMemoizedFn(() => {
      setPreviewUrl(cdnUrl);
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
        loading="lazy"
        {...restProps}
      />
    );
  },
);

export default LocalImage;
