import { IResourceService } from "@tau/shared/host-services";
import React, { forwardRef, useState } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import { getHomeDir } from "@/commands";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import useSettingStore from "@/stores/useSettingStore";
import { addRemoteImageCacheEntry } from "@/commands/remote-image-cache";
import { isCollaborationResource } from "@tau/collaboration";
import { useOptionalService } from "@tau/editor";
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
  /** 回退地址也加载失败时回调（调用方据此换兜底展示，避免裂图） */
  onLoadError?: () => void;
  [key: string]: any;
}

/**
 * 解析结果缓存（原始地址 → 可直接给 <img> 的预览地址）。
 * 解析是异步的（路径换算、远程图落地缓存），不缓存的话每次挂载都会先空一帧再出图，列表重进时整片闪烁。
 */
const PREVIEW_CACHE_LIMIT = 500;
const previewCache = new Map<string, string>();

function cachePreview(key: string, value: string) {
  previewCache.delete(key);
  previewCache.set(key, value);
  if (previewCache.size > PREVIEW_CACHE_LIMIT) {
    previewCache.delete(previewCache.keys().next().value!);
  }
}

const LocalImage = forwardRef<HTMLImageElement, ILocalImageProps>((props, ref) => {
  const { url, alt, className, style, onClick, onLoadError, ...restProps } = props;
  const cdnUrl = useGithubCdnUrl(url) || url;

  // 本组件既在编辑器内当图片插槽，也被大量宿主界面直接使用。
  // 编辑器内要尊重注册表的覆盖（共享模式下资源经 binding 解析），编辑器外回落默认实现。
  const remoteResourceToLocalService =
    useOptionalService(IResourceService)?.remoteResourceToLocal ?? remoteResourceToLocal;
  const autoCacheRemoteImage = useSettingStore(state => state.setting.misc.image.autoCacheRemote);
  const cacheKey = `${autoCacheRemoteImage ? 1 : 0}|${cdnUrl}`;

  const [previewUrl, setPreviewUrl] = useState<string | undefined>(() =>
    previewCache.get(cacheKey)
  );
  const [isConverting, setIsConverting] = useState(() => !previewCache.has(cacheKey));

  useAsyncEffect(async () => {
    const cached = previewCache.get(cacheKey);
    if (cached) {
      setPreviewUrl(cached);
      setIsConverting(false);
      return;
    }
    setIsConverting(true);
    const setResolved = (value: string) => {
      cachePreview(cacheKey, value);
      setPreviewUrl(value);
    };
    try {
      if (!cdnUrl) {
        setPreviewUrl(undefined);
        return;
      }

      if (isCollaborationResource(cdnUrl) && remoteResourceToLocalService) {
        const localPath = await remoteResourceToLocalService(cdnUrl);
        const localPreview = await toLocalMediaPreviewUrl(localPath);
        setResolved(localPreview.url);
        return;
      }

      const resolvedUrl = await resolveLocalMediaPath(cdnUrl);

      if (isDirectMediaUrl(resolvedUrl)) {
        setResolved(resolvedUrl);
        return;
      }

      if (resolvedUrl.startsWith("http")) {
        try {
          if (!autoCacheRemoteImage) {
            setResolved(resolvedUrl);
            return;
          }
          const localUrl = await remoteResourceToLocal(resolvedUrl);
          await addRemoteImageCacheEntry({
            url: resolvedUrl,
            localPath: localUrl,
            title: alt,
          });
          const { url: localPreviewUrl } = await toLocalMediaPreviewUrl(localUrl);
          setResolved(localPreviewUrl);
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
      setResolved(localPreviewUrl);
    } catch (e) {
      console.error(e);
      setPreviewUrl(cdnUrl);
    } finally {
      setIsConverting(false);
    }
  }, [cacheKey, cdnUrl, autoCacheRemoteImage, alt, remoteResourceToLocalService]);

  const onError = useMemoizedFn(() => {
    // 缓存的地址失效了（本地缓存文件被清等）就作废，下次挂载重新解析
    previewCache.delete(cacheKey);
    // 先回退到原始地址重试一次；仍失败才交给调用方兜底
    if (previewUrl !== cdnUrl) {
      setPreviewUrl(cdnUrl);
      return;
    }
    onLoadError?.();
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
