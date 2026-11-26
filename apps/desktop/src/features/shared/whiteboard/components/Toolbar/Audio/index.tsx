import { useWhiteboardAvI18n } from "../../../av.i18n";
import { AudioLines, Upload, Link, Mic } from "lucide-react";
import { ToolMenu, type WhiteboardToolProps } from "@tau/whiteboard";

export default function AudioTool({ run }: WhiteboardToolProps) {
  const { t } = useWhiteboardAvI18n();
  return (
    <ToolMenu
      label={t("tool.audio")}
      icon={<AudioLines strokeWidth={1.75} />}
      items={[
        { key: "local", label: t("tool.local"), icon: Upload, onSelect: () => run("local") },
        { key: "url", label: t("tool.url"), icon: Link, onSelect: () => run("url") },
        { key: "tts", label: t("tool.tts"), icon: Mic, onSelect: () => run("tts") },
      ]}
    />
  );
}
