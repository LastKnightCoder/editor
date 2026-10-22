import { useCallback, useEffect, useState } from "react";
import { useReadOnly } from "slate-react";
import { configureMedia, type ResourceKind, type ResourceState } from "@tau/plugins/media";
import { useOptionalService } from "@tau/editor";
import { IResourceService } from "@tau/shared/host-services";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import useGithubCdnUrl from "@/hooks/useGithubCdnUrl";
import useSettingStore from "@/stores/useSettingStore";
import { remoteResourceToLocal } from "@/utils";
import { imagePreviewCache, imagePreviewCacheKey, resolveMediaSource } from "@/utils/mediaSource";
import {
  desktopEditorSlots,
  desktopResourceService,
} from "@/services/editorServiceImplementations";

type ResolvedState = Omit<ResourceState, "retry">;

/** 与内置媒体组件同一套解析：编辑器内走当前 kit 的资源服务（共享文档经协作 binding），编辑器外走应用默认实现 */
function useResource(url: string, { kind }: { kind: ResourceKind }): ResourceState {
  const source = useGithubCdnUrl(url) || url;
  const resolveCollaborationResource =
    useOptionalService(IResourceService)?.remoteResourceToLocal ?? remoteResourceToLocal;
  const autoCacheImage = useSettingStore(state => state.setting.misc.image.autoCacheRemote);
  const autoCacheAudio = useSettingStore(state => state.setting.misc.audio.autoCacheRemote);
  const autoCacheRemote =
    kind === "image" ? autoCacheImage : kind === "audio" ? autoCacheAudio : kind === "video";
  const cacheKey = kind === "image" ? imagePreviewCacheKey(source, autoCacheRemote) : undefined;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ResolvedState>(() => {
    const cached = cacheKey && imagePreviewCache.get(cacheKey);
    return cached ? { src: cached, status: "ready" } : { src: undefined, status: "loading" };
  });

  useEffect(() => {
    const cached = cacheKey && imagePreviewCache.get(cacheKey);
    if (cached) {
      setState({ src: cached, status: "ready" });
      return;
    }
    let active = true;
    setState({ src: undefined, status: "loading" });
    resolveMediaSource(source, { kind, autoCacheRemote, resolveCollaborationResource })
      .then(resolved => {
        if (!active) return;
        if (!resolved) {
          setState({ src: undefined, status: "error" });
          return;
        }
        if (cacheKey && !resolved.failed) imagePreviewCache.set(cacheKey, resolved.url);
        setState({ src: resolved.url, status: "ready" });
      })
      .catch(error => {
        console.error(error);
        if (active) setState({ src: undefined, status: "error" });
      });
    return () => {
      active = false;
    };
  }, [source, kind, autoCacheRemote, resolveCollaborationResource, cacheKey, attempt]);

  const retry = useCallback(() => {
    if (cacheKey) imagePreviewCache.delete(cacheKey);
    setAttempt(value => value + 1);
  }, [cacheKey]);

  return { ...state, retry };
}

function useResourceUpload() {
  const service = useOptionalService(IResourceService);
  // 编辑器外没有 Slate 上下文时为 false
  const readOnly = useReadOnly();
  return readOnly ? undefined : (service ?? desktopResourceService).upload;
}

// 桌面各处编辑器的媒体外观都取同一份设置，与内置图片扩展一致
const useDesktopMediaAppearance = () => useSettingStore(state => state.setting.appearance?.image);

const useSlots = () => useOptionalService(IEditorSlots) ?? desktopEditorSlots;

configureMedia({
  useResource,
  useResourceUpload,
  useMediaAppearance: useDesktopMediaAppearance,
  MediaImage: props => {
    const { Image } = useSlots();
    return <Image {...props} />;
  },
  MediaVideo: props => {
    const { Video } = useSlots();
    return <Video {...props} />;
  },
  MediaAudio: props => {
    const { Audio } = useSlots();
    return <Audio {...props} />;
  },
});
