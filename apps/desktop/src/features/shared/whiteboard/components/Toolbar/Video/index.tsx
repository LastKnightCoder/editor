import { useWhiteboardAvI18n } from "../../../av.i18n";
import { Video as VideoIcon, Upload, Link, MonitorPlay } from "lucide-react";
import { ToolMenu, type WhiteboardToolProps } from "@tau/whiteboard";
import { useVideoProviders } from "@/hooks/useVideoProviders";

export default function VideoTool({ run }: WhiteboardToolProps) {
  const { t } = useWhiteboardAvI18n();
  const { providers } = useVideoProviders();
  return (
    <ToolMenu
      label={t("tool.video")}
      icon={<VideoIcon strokeWidth={1.75} />}
      items={[
        { key: "local", label: t("tool.local"), icon: Upload, onSelect: () => run("local") },
        { key: "url", label: t("tool.url"), icon: Link, onSelect: () => run("url") },
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
