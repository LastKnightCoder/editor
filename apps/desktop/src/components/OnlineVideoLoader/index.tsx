import { useVideoWatchI18n } from "@/components/VideoNotePanel/watch.i18n";
import VideoSourceLoader, { type VideoSourceLoaderProps } from "@/components/VideoSourceLoader";
import { useVideoProviderName } from "@/hooks/useVideoProviders";

type OnlineVideoLoaderProps = Omit<VideoSourceLoaderProps, "sourceLabel" | "tips"> & {
  providerId: string;
};

/** 在线视频取源浮层，来源名取自提供方插件。 */
export default function OnlineVideoLoader({ providerId, ...props }: OnlineVideoLoaderProps) {
  const { t } = useVideoWatchI18n();
  return (
    <VideoSourceLoader
      {...props}
      sourceLabel={useVideoProviderName(providerId)}
      tips={[t("tips.network"), t("tips.account"), t("tips.membership")]}
    />
  );
}
