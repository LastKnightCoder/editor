import type { ComponentType } from "react";

import {
  useBilibiliVideoWithContext,
  useRemoteVideoWithContext,
  useYoutubeVideoWithContext,
} from "@tau/shared";
import { type MediaInsertSource, type VideoContentProvider } from "@tau/editor-media/services";
import { type VideoElementMeta } from "@tau/editor-media/types";

import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import RemoteVideoLoader from "@/components/RemoteVideoLoader";
import VideoSourceLoader from "@/components/VideoSourceLoader";
import BilibiliVideoSelectModal from "@/components/BilibiliVideoSelectModal";
import YoutubeVideoSelectModal from "@/components/YoutubeVideoSelectModal";
import { Tv, Youtube } from "lucide-react";
import { isBilibiliUrl } from "@/utils/bilibili/parser";
import { isYoutubeUrl } from "@/utils/youtube/parser";

import { showMediaNode } from "./mediaModalHost";

/**
 * 视频内容源 Provider（desktop）：
 * bilibili / youtube / remote 三种业务内容源的解析渲染与插入入口。
 */

// ---- 内容渲染 ----

const MissingMetaHint = ({ platform }: { platform: string }) => (
  <VideoSourceLoader
    framed
    loading={false}
    error="缺少视频解析信息，请通过「添加视频」入口重新插入"
    streamProgress={null}
    sourceLabel={platform}
    tips={[]}
  />
);

const BilibiliContent: VideoContentProvider["Content"] = ({ element, renderPlayback }) => {
  const meta =
    element.metaInfo?.type === "bilibili"
      ? (element.metaInfo as unknown as Parameters<typeof useBilibiliVideoWithContext>[0])
      : undefined;
  const { videoUrl, loading, error, streamProgress, retry } = useBilibiliVideoWithContext(meta);

  if (!meta) return <MissingMetaHint platform="Bilibili" />;
  return (
    <>
      <BilibiliVideoLoader
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

const YoutubeContent: VideoContentProvider["Content"] = ({ element, renderPlayback }) => {
  const meta =
    element.metaInfo?.type === "youtube"
      ? (element.metaInfo as unknown as Parameters<typeof useYoutubeVideoWithContext>[0])
      : undefined;
  const { videoUrl, loading, error, streamProgress, retry } = useYoutubeVideoWithContext(meta);

  if (!meta) return <MissingMetaHint platform="YouTube" />;
  return (
    <>
      <YoutubeVideoLoader
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

// ---- 插入来源 ----

function createSelectModalSource<T extends { url: string }>(options: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  SelectModal: ComponentType<{
    open: boolean;
    onCancel: () => void;
    onConfirm: (result: T) => void;
  }>;
  /** 由弹窗结果构造写入文档的 metaInfo（流地址等解析信息 + 标题），插入后据此匹配渲染 Provider */
  buildMetaInfo: (result: T) => VideoElementMeta | undefined;
}): MediaInsertSource {
  return {
    id: options.id,
    label: options.label,
    icon: options.icon,
    mediaTypes: ["video"],
    open: ({ onInsert }) => {
      const { SelectModal } = options;
      const close = showMediaNode(
        <SelectModal
          open
          onCancel={() => close()}
          onConfirm={result => {
            onInsert({
              src: result.url,
              metaInfo: options.buildMetaInfo(result),
            });
            close();
          }}
        />
      );
    },
  };
}

const bilibiliVideoProvider: VideoContentProvider = {
  id: "bilibili",
  label: "Bilibili",
  match: element => element.metaInfo?.type === "bilibili",
  isSourceUrl: isBilibiliUrl,
  Content: BilibiliContent,
};

const youtubeVideoProvider: VideoContentProvider = {
  id: "youtube",
  label: "YouTube",
  match: element => element.metaInfo?.type === "youtube",
  isSourceUrl: isYoutubeUrl,
  Content: YoutubeContent,
};

const remoteVideoProvider: VideoContentProvider = {
  id: "remote",
  match: element => !element.metaInfo && /^https?:\/\//i.test(element.src || ""),
  Content: RemoteContent,
};

export const desktopVideoContentProviders: VideoContentProvider[] = [
  bilibiliVideoProvider,
  youtubeVideoProvider,
  remoteVideoProvider,
];

export const desktopVideoInsertSources: MediaInsertSource[] = [
  createSelectModalSource({
    id: "bilibili",
    label: "Bilibili",
    icon: Tv,
    SelectModal: BilibiliVideoSelectModal,
    buildMetaInfo: result => ({ ...result.metaInfo, title: result.title }),
  }),
  createSelectModalSource({
    id: "youtube",
    label: "YouTube",
    icon: Youtube,
    SelectModal: YoutubeVideoSelectModal,
    buildMetaInfo: result => ({
      type: "youtube",
      url: result.url,
      videoStream: result.videoStream,
      audioStream: result.audioStream,
      title: result.title,
    }),
  }),
];
