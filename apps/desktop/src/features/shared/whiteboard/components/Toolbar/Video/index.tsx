import { Video as VideoIcon, Upload, Link, MonitorPlay, Youtube } from "lucide-react";
import { ToolMenu, type WhiteboardToolProps } from "@tau/whiteboard";

export default function VideoTool({ run }: WhiteboardToolProps) {
  return (
    <ToolMenu
      label="视频"
      icon={<VideoIcon strokeWidth={1.75} />}
      items={[
        { key: "local", label: "本地上传", icon: Upload, onSelect: () => run("local") },
        { key: "url", label: "网络地址", icon: Link, onSelect: () => run("url") },
        { key: "bilibili", label: "Bilibili", icon: MonitorPlay, onSelect: () => run("bilibili") },
        { key: "youtube", label: "YouTube", icon: Youtube, onSelect: () => run("youtube") },
      ]}
    />
  );
}
