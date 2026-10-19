import { useRemoteVideoWithContext } from "@tau/shared";
import {
  type MediaInsertSource,
  type VideoContentProvider,
} from "@tau/editor/extensions/media/services";
import { MonitorPlay } from "lucide-react";

import RemoteVideoLoader from "@/components/RemoteVideoLoader";
import OnlineVideoLoader from "@/components/OnlineVideoLoader";
import OnlineVideoSelectModal from "@/components/OnlineVideoSelectModal";
import { getVideoProviders } from "@/commands/plugin-video";
import { useOnlineVideo } from "@/hooks/useOnlineVideo";
import { buildOnlineVideoMeta, isOnlineVideoType } from "@/types/online-video";

import { showMediaNode } from "./mediaModalHost";

/**
 * 视频内容源 Provider（desktop）：
 * 视频插件与远程直链两种内容源的渲染，以及各视频插件的插入入口。
 */

// ---- 内容渲染 ----

const OnlineContent: VideoContentProvider["Content"] = ({ element, renderPlayback }) => {
  const providerId = String(element.metaInfo?.type);
  const { videoUrl, loading, error, streamProgress, retry } = useOnlineVideo(element.metaInfo);
  return (
    <>
      <OnlineVideoLoader
        providerId={providerId}
        framed
        loading={loading}
        error={error}
        streamProgress={streamProgress}
        onRetry={retry}
      />
      {videoUrl && !loading && !error ? renderPlayback(videoUrl) : null}
    </>
  );
};

const RemoteContent: VideoContentProvider["Content"] = ({ element, renderPlayback }) => {
  const { videoUrl, loading, error, streamProgress, retry } = useRemoteVideoWithContext(
    element.src
  );
  return (
    <>
      <RemoteVideoLoader
        framed
        loading={loading}
        error={error}
        streamProgress={streamProgress}
        onRetry={retry}
      />
      {videoUrl && !loading && !error ? renderPlayback(videoUrl, false) : null}
    </>
  );
};

const onlineVideoProvider: VideoContentProvider = {
  id: "online",
  label: element => {
    const type = element.metaInfo?.type;
    return getVideoProviders().providers.find(provider => provider.id === type)?.name ?? type;
  },
  match: element => isOnlineVideoType(element.metaInfo?.type),
  Content: OnlineContent,
};

const remoteVideoProvider: VideoContentProvider = {
  id: "remote",
  match: element => !element.metaInfo && /^https?:\/\//i.test(element.src || ""),
  Content: RemoteContent,
};

export const desktopVideoContentProviders: VideoContentProvider[] = [
  onlineVideoProvider,
  remoteVideoProvider,
];

// ---- 插入来源 ----

/** 每个启用的视频插件一个入口，名称取插件名；插件启停后下次打开菜单即更新。 */
export const getDesktopVideoInsertSources = (): MediaInsertSource[] =>
  getVideoProviders().providers.map(provider => ({
    id: `video-plugin:${provider.id}`,
    label: provider.name,
    icon: MonitorPlay,
    mediaTypes: ["video"],
    open: ({ onInsert }) => {
      const close = showMediaNode(
        <OnlineVideoSelectModal
          providerId={provider.id}
          open
          onCancel={() => close()}
          onConfirm={result => {
            onInsert({
              src: result.url,
              metaInfo: buildOnlineVideoMeta(result.providerId, result.ref, result.title),
            });
            close();
          }}
        />
      );
    },
  }));
