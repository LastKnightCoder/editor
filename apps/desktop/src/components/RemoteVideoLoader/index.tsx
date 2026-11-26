import { useVideoWatchI18n } from "@/components/VideoNotePanel/watch.i18n";
import VideoSourceLoader, { type VideoSourceLoaderProps } from "@/components/VideoSourceLoader";

type RemoteVideoLoaderProps = Omit<VideoSourceLoaderProps, "sourceLabel" | "tips">;

const RemoteVideoLoader = (props: RemoteVideoLoaderProps) => {
  const { t } = useVideoWatchI18n();
  return (
    <VideoSourceLoader {...props} tips={[t("tips.network"), t("tips.link"), t("tips.retry")]} />
  );
};

export default RemoteVideoLoader;
