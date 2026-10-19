import VideoSourceLoader, { type VideoSourceLoaderProps } from "@/components/VideoSourceLoader";
import { useVideoProviderName } from "@/hooks/useVideoProviders";

type OnlineVideoLoaderProps = Omit<VideoSourceLoaderProps, "sourceLabel" | "tips"> & {
  providerId: string;
};

const TIPS = [
  "检查网络连接是否正常",
  "在「设置 · 账号与连接」中检查账号或代理",
  "部分清晰度可能需要会员权限",
];

/** 在线视频取源浮层，来源名取自提供方插件。 */
export default function OnlineVideoLoader({ providerId, ...props }: OnlineVideoLoaderProps) {
  return (
    <VideoSourceLoader {...props} sourceLabel={useVideoProviderName(providerId)} tips={TIPS} />
  );
}
