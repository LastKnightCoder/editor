import { IResourceService } from "@tau/shared/host-services";
import React, { forwardRef, useState } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { remoteResourceToLocal } from "@/utils";
import useSettingStore from "@/stores/useSettingStore";
import { useOptionalService } from "@tau/editor";
import {
  imagePreviewCache as previewCache,
  imagePreviewCacheKey,
  resolveMediaSource,
} from "@/utils/mediaSource";

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

const LocalImage = forwardRef<HTMLImageElement, ILocalImageProps>((props, ref) => {
  const { url, alt, className, style, onClick, onLoadError, ...restProps } = props;
  // 本组件既在编辑器内当图片插槽，也被大量宿主界面直接使用。
  // 编辑器内要尊重注册表的覆盖（共享模式下资源经 binding 解析），编辑器外回落默认实现。
  const remoteResourceToLocalService =
    useOptionalService(IResourceService)?.remoteResourceToLocal ?? remoteResourceToLocal;
  const autoCacheRemoteImage = useSettingStore(state => state.setting.misc.image.autoCacheRemote);
  const cacheKey = imagePreviewCacheKey(url, autoCacheRemoteImage);

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
    try {
      const resolved = await resolveMediaSource(url, {
        kind: "image",
        autoCacheRemote: autoCacheRemoteImage,
        title: alt,
        resolveCollaborationResource: remoteResourceToLocalService,
      });
      if (!resolved) {
        setPreviewUrl(undefined);
        return;
      }
      if (!resolved.failed) previewCache.set(cacheKey, resolved.url);
      setPreviewUrl(resolved.url);
    } catch (e) {
      console.error(e);
      setPreviewUrl(url);
    } finally {
      setIsConverting(false);
    }
  }, [cacheKey, url, autoCacheRemoteImage, alt, remoteResourceToLocalService]);

  const onError = useMemoizedFn(() => {
    // 缓存的地址失效了（本地缓存文件被清等）就作废，下次挂载重新解析
    previewCache.delete(cacheKey);
    // 先回退到原始地址重试一次；仍失败才交给调用方兜底
    if (previewUrl !== url) {
      setPreviewUrl(url);
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
