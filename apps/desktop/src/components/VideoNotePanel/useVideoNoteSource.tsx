/**
 * 视频笔记取源：按 metaInfo 选视频插件 / 远程下载缓存 / 本地，
 * 给出可播放地址、加载与错误态、是否走 LocalVideo，以及对应来源的下载进度浮层。
 */

import { useMemo } from "react";
import { useRemoteVideoWithContext } from "@tau/shared";
import useSettingStore from "@/stores/useSettingStore";
import OnlineVideoLoader from "@/components/OnlineVideoLoader";
import RemoteVideoLoader from "@/components/RemoteVideoLoader";
import { useOnlineVideo } from "@/hooks/useOnlineVideo";
import { shouldUseLocalVideoCache } from "@/utils/video";
import { isLocalVideoMeta, isRemoteVideoMeta, type VideoMetaInfo } from "@/types";

export function useVideoNoteSource(metaInfo: VideoMetaInfo | null | undefined) {
  const autoCacheRemoteVideo = useSettingStore(state => state.setting.misc.video.autoCacheRemote);
  const local = metaInfo && isLocalVideoMeta(metaInfo) ? metaInfo : undefined;
  const remoteMeta = metaInfo && isRemoteVideoMeta(metaInfo) ? metaInfo : undefined;
  const onlineMeta = metaInfo && !local && !remoteMeta ? metaInfo : undefined;

  // 两个 hook 每次都调用，不适用的来源传 undefined（内部不做事）
  const online = useOnlineVideo(onlineMeta);
  const remote = useRemoteVideoWithContext(remoteMeta?.url);
  const active = onlineMeta ? online : remoteMeta ? remote : null;

  const src = useMemo(() => {
    if (!metaInfo) return null;
    if (local) return local.filePath;
    return active?.videoUrl ?? null;
  }, [metaInfo, local, active?.videoUrl]);

  const useLocalVideo = useMemo(() => {
    if (local) return true;
    if (remoteMeta) return shouldUseLocalVideoCache(remoteMeta.url, autoCacheRemoteVideo);
    return false;
  }, [local, remoteMeta, autoCacheRemoteVideo]);

  const loading = metaInfo ? (active?.loading ?? false) : true;
  const error = active?.error ?? null;

  const loader = onlineMeta ? (
    <OnlineVideoLoader
      providerId={onlineMeta.type}
      loading={online.loading}
      error={online.error}
      streamProgress={online.streamProgress}
      onRetry={online.retry}
    />
  ) : remoteMeta ? (
    <RemoteVideoLoader
      loading={remote.loading}
      error={remote.error}
      streamProgress={remote.streamProgress}
      onRetry={remote.retry}
    />
  ) : null;

  return {
    src,
    loading,
    error,
    useLocalVideo,
    /** 视频就绪（可渲染 video 元素） */
    ready: !loading && !error && !!src,
    /** 来源对应的下载 / 错误浮层，叠在视频容器上 */
    loader,
  };
}
