import { Video as VideoIcon, Upload, Link, MonitorPlay } from "lucide-react";
import { ToolMenu, type WhiteboardToolProps } from "@tau/whiteboard";
import { useVideoProviders } from "@/hooks/useVideoProviders";

export default function VideoTool({ run }: WhiteboardToolProps) {
  const { providers } = useVideoProviders();
  return (
    <ToolMenu
      label="视频"
      icon={<VideoIcon strokeWidth={1.75} />}
      items={[
        { key: "local", label: "本地上传", icon: Upload, onSelect: () => run("local") },
        { key: "url", label: "网络地址", icon: Link, onSelect: () => run("url") },
        ...providers.map(provider => ({
          key: `source:${provider.id}`,
          label: provider.name,
          icon: MonitorPlay,
          onSelect: () => run(`source:${provider.id}`),
        })),
      ]}
    />
  );
}
