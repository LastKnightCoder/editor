import VideoSourceLoader, { type VideoSourceLoaderProps } from "@/components/VideoSourceLoader";

type RemoteVideoLoaderProps = Omit<VideoSourceLoaderProps, "sourceLabel" | "tips">;

const TIPS = ["检查网络连接是否正常", "确认视频链接是否有效", "稍后重试或尝试其他视频链接"];

const RemoteVideoLoader = (props: RemoteVideoLoaderProps) => (
  <VideoSourceLoader {...props} tips={TIPS} />
);

export default RemoteVideoLoader;
