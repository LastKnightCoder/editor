import { Image as ImageIcon, Link, Sparkles, Upload } from "lucide-react";

import { useBoard } from "@tau/whiteboard";
import { ToolMenu } from "@tau/whiteboard";

const Image = () => {
  const board = useBoard();
  const open = (action: "local" | "url" | "ai") =>
    board.emit("context-menu:open-modal", { type: "image", action });

  return (
    <ToolMenu
      label="图片"
      icon={<ImageIcon strokeWidth={1.75} />}
      items={[
        { key: "local", label: "本地上传", icon: Upload, onSelect: () => open("local") },
        { key: "url", label: "输入 URL", icon: Link, onSelect: () => open("url") },
        { key: "ai", label: "AI 图片生成", icon: Sparkles, onSelect: () => open("ai") },
      ]}
    />
  );
};

export default Image;
