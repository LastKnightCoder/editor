import { Image as ImageIcon, Link, Sparkles, Upload } from "lucide-react";
import { ToolMenu, type WhiteboardToolProps } from "@tau/whiteboard";

export default function ImageTool({ run }: WhiteboardToolProps) {
  return (
    <ToolMenu
      label="图片"
      icon={<ImageIcon strokeWidth={1.75} />}
      items={[
        { key: "local", label: "本地上传", icon: Upload, onSelect: () => run("local") },
        { key: "url", label: "输入 URL", icon: Link, onSelect: () => run("url") },
        { key: "ai", label: "AI 图片生成", icon: Sparkles, onSelect: () => run("ai") },
      ]}
    />
  );
}
