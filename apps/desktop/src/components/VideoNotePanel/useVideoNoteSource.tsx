/**
 * 视频笔记取源：按 metaInfo 选 bilibili / youtube / 远程下载缓存 / 本地，
 * 给出可播放地址、加载与错误态、是否走 LocalVideo，以及对应来源的下载进度浮层。
 */

import { useMemo } from "react";
import useSettingStore from "@/stores/useSettingStore";
import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import RemoteVideoLoader from "@/components/RemoteVideoLoader";
import { useBilibiliVideo } from "@/hooks/useBilibiliVideo";
import { useYoutubeVideo } from "@/hooks/useYoutubeVideo";
import { useRemoteVideo } from "@/hooks/useRemoteVideo";
import { shouldUseLocalVideoCache } from "@/utils/video";
import type { VideoMetaInfo } from "@/types";

export function useVideoNoteSource(metaInfo: VideoMetaInfo | null | undefined) {
  const autoCacheRemoteVideo = useSettingStore(state => state.setting.misc.video.autoCacheRemote);
  const type = metaInfo?.type;

  // 三个 hook 每次都调用，不适用的来源传 undefined（内部不做事）
  const bilibili = useBilibiliVideo(metaInfo?.type === "bilibili" ? metaInfo : undefined);
  const youtube = useYoutubeVideo(metaInfo?.type === "youtube" ? metaInfo : undefined);
  const remote = useRemoteVideo(metaInfo?.type === "remote" ? metaInfo.url : undefined);

  const active =
    type === "bilibili"
      ? bilibili
      : type === "youtube"
        ? youtube
        : type === "remote"
          ? remote
          : null;

  const src = useMemo(() => {
    if (!metaInfo) return null;
    if (metaInfo.type === "local") return metaInfo.filePath;
    return active?.videoUrl ?? null;
  }, [metaInfo, active?.videoUrl]);

  const useLocalVideo = useMemo(() => {
    if (!metaInfo) return false;
    if (metaInfo.type === "local") return true;
    if (metaInfo.type === "remote") {
      return shouldUseLocalVideoCache(metaInfo.url, autoCacheRemoteVideo);
    }
    return false;
  }, [metaInfo, autoCacheRemoteVideo]);

  const loading = metaInfo ? (active?.loading ?? false) : true;
  const error = active?.error ?? null;

  const loader =
    type === "bilibili" ? (
      <BilibiliVideoLoader
        loading={bilibili.loading}
        error={bilibili.error}
        streamProgress={bilibili.streamProgress}
      />
    ) : type === "youtube" ? (
      <YoutubeVideoLoader
        loading={youtube.loading}
        error={youtube.error}
        streamProgress={youtube.streamProgress}
      />
    ) : type === "remote" ? (
      <RemoteVideoLoader
        loading={remote.loading}
        error={remote.error}
        streamProgress={remote.streamProgress}
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
