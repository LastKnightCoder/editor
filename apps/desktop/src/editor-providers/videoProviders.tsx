import type { ComponentType } from "react";

import {
  useBilibiliVideoWithContext,
  useRemoteVideoWithContext,
  useYoutubeVideoWithContext,
} from "@tau/shared";
import type { MediaInsertSource, VideoContentProvider, VideoElementMeta } from "@tau/editor/src";

import BilibiliVideoLoader from "@/components/BilibiliVideoLoader";
import YoutubeVideoLoader from "@/components/YoutubeVideoLoader";
import RemoteVideoLoader from "@/components/RemoteVideoLoader";
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
  <div style={{ color: "#ff4d4f", padding: 8 }}>
    缺少 {platform} metaInfo，请通过添加视频入口创建
  </div>
);

const BilibiliContent: VideoContentProvider["Content"] = ({ element, renderPlayback }) => {
  const meta =
    element.metaInfo?.type === "bilibili"
      ? (element.metaInfo as unknown as Parameters<typeof useBilibiliVideoWithContext>[0])
      : undefined;
  const { videoUrl, loading, error, streamProgress } = useBilibiliVideoWithContext(meta);

  if (!meta) return <MissingMetaHint platform="Bilibili" />;
  return (
    <>
      <BilibiliVideoLoader loading={loading} error={error} streamProgress={streamProgress} />
      {videoUrl && !loading && !error ? renderPlayback(videoUrl) : null}
    </>
  );
};

const YoutubeContent: VideoContentProvider["Content"] = ({ element, renderPlayback }) => {
  const meta =
    element.metaInfo?.type === "youtube"
      ? (element.metaInfo as unknown as Parameters<typeof useYoutubeVideoWithContext>[0])
      : undefined;
  const { videoUrl, loading, error, streamProgress } = useYoutubeVideoWithContext(meta);

  if (!meta) return <MissingMetaHint platform="YouTube" />;
  return (
    <>
      <YoutubeVideoLoader loading={loading} error={error} streamProgress={streamProgress} />
      {videoUrl && !loading && !error ? renderPlayback(videoUrl) : null}
    </>
  );
};

const RemoteContent: VideoContentProvider["Content"] = ({ element, renderPlayback }) => {
  const { videoUrl, loading, error, streamProgress } = useRemoteVideoWithContext(element.src);
  return (
    <>
      <RemoteVideoLoader loading={loading} error={error} streamProgress={streamProgress} />
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
  /** 由弹窗结果构造写入文档的 metaInfo（流地址等解析信息），插入后据此匹配渲染 Provider */
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
  match: element => element.metaInfo?.type === "bilibili",
  isSourceUrl: isBilibiliUrl,
  Content: BilibiliContent,
};

const youtubeVideoProvider: VideoContentProvider = {
  id: "youtube",
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
    buildMetaInfo: result => ({ ...result.metaInfo }),
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
    }),
  }),
];
