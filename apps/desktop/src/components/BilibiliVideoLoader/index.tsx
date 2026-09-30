import VideoSourceLoader, { type VideoSourceLoaderProps } from "@/components/VideoSourceLoader";

type BilibiliVideoLoaderProps = Omit<VideoSourceLoaderProps, "sourceLabel" | "tips">;

const TIPS = [
  "检查网络连接是否正常",
  "在设置中配置 Bilibili 凭证（SESSDATA）",
  "部分高清视频需要大会员权限",
];

const BilibiliVideoLoader = (props: BilibiliVideoLoaderProps) => (
  <VideoSourceLoader {...props} sourceLabel="Bilibili" tips={TIPS} />
);

export default BilibiliVideoLoader;
