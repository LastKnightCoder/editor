import React, { forwardRef, useState } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { useContext } from "react";
import { remoteResourceToLocal } from "@/utils";
import { getHomeDir } from "@/commands";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import useSettingStore from "@/stores/useSettingStore";
import { addRemoteImageCacheEntry } from "@/commands/remote-image-cache";
import { ASSET_PREFIX } from "@tau/collaboration";
import { EditorServicesContext } from "@tau/editor/src/contexts/EditorServicesContext";
import {
  resolveLocalMediaPath,
  isDirectMediaUrl,
  toLocalMediaPreviewUrl,
} from "@/utils/localMediaPath";

interface ILocalImageProps {
  url: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  [key: string]: any;
}

const LocalImage = forwardRef<HTMLImageElement, ILocalImageProps>((props, ref) => {
  const { url, alt, className, style, onClick, ...restProps } = props;
  const cdnUrl = useGithubCdnUrl(url) || url;

  const [previewUrl, setPreviewUrl] = useState<string>();
  const [isConverting, setIsConverting] = useState(true);
  const editorServices = useContext(EditorServicesContext);
  const autoCacheRemoteImage = useSettingStore(state => state.setting.misc.image.autoCacheRemote);

  useAsyncEffect(async () => {
    setIsConverting(true);
    try {
      if (!cdnUrl) {
        setPreviewUrl(undefined);
        return;
      }

      if (cdnUrl.startsWith(ASSET_PREFIX) && editorServices?.resource.remoteResourceToLocal) {
        const localPath = await editorServices.resource.remoteResourceToLocal(cdnUrl);
        const localPreview = await toLocalMediaPreviewUrl(localPath);
        setPreviewUrl(localPreview.url);
        return;
      }

      const resolvedUrl = await resolveLocalMediaPath(cdnUrl);

      if (isDirectMediaUrl(resolvedUrl)) {
        setPreviewUrl(resolvedUrl);
        return;
      }

      if (resolvedUrl.startsWith("http")) {
        try {
          if (!autoCacheRemoteImage) {
            setPreviewUrl(resolvedUrl);
            return;
          }
          const localUrl = await remoteResourceToLocal(resolvedUrl);
          await addRemoteImageCacheEntry({
            url: resolvedUrl,
            localPath: localUrl,
            title: alt,
          });
          const { url: localPreviewUrl } = await toLocalMediaPreviewUrl(localUrl);
          setPreviewUrl(localPreviewUrl);
        } catch (error) {
          console.error(error);
          setPreviewUrl(resolvedUrl);
        }
        return;
      }

      const homeDir = await getHomeDir();
      const absolutePath = resolvedUrl.startsWith("~")
        ? `${homeDir}${resolvedUrl.slice(1)}`
        : resolvedUrl;
      const { url: localPreviewUrl } = await toLocalMediaPreviewUrl(absolutePath);
      setPreviewUrl(localPreviewUrl);
    } catch (e) {
      console.error(e);
      setPreviewUrl(cdnUrl);
    } finally {
      setIsConverting(false);
    }
  }, [cdnUrl, autoCacheRemoteImage, alt, editorServices]);

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
});

export default LocalImage;
