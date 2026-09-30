import VideoSourceLoader, { type VideoSourceLoaderProps } from "@/components/VideoSourceLoader";

type YoutubeVideoLoaderProps = Omit<VideoSourceLoaderProps, "sourceLabel" | "tips">;

const TIPS = [
  "检查网络连接是否正常",
  "在设置中配置 YouTube 代理服务器",
  "重启应用后重试，或尝试其他视频链接",
];

const YoutubeVideoLoader = (props: YoutubeVideoLoaderProps) => (
  <VideoSourceLoader {...props} sourceLabel="YouTube" tips={TIPS} />
);

export default YoutubeVideoLoader;
