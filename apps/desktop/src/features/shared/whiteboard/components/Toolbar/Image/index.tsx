import { useImageWebviewI18n } from "../../../image-webview.i18n";
import { Image as ImageIcon, Link, Sparkles, Upload } from "lucide-react";
import { ToolMenu, type WhiteboardToolProps } from "@tau/whiteboard";

export default function ImageTool({ run }: WhiteboardToolProps) {
  const { t } = useImageWebviewI18n();
  return (
    <ToolMenu
      label={t("tool.image")}
      icon={<ImageIcon strokeWidth={1.75} />}
      items={[
        { key: "local", label: t("tool.local"), icon: Upload, onSelect: () => run("local") },
        { key: "url", label: t("tool.url"), icon: Link, onSelect: () => run("url") },
        { key: "ai", label: t("image.aiTitle"), icon: Sparkles, onSelect: () => run("ai") },
      ]}
    />
  );
}
