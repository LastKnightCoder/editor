import { useState } from "react";
import SVG from "react-inlinesvg";
import { Tooltip, Popover } from "antd";
import { Upload, Link, Sparkles } from "lucide-react";
import imageIcon from "@/assets/white-board/image.svg";

import { useBoard } from "../../../hooks";
import ToolbarMenu, { ToolbarMenuItem } from "../ToolbarMenu";

interface ImageProps {
  className?: string;
  style?: React.CSSProperties;
}

const Image = (props: ImageProps) => {
  const { className, style } = props;
  const board = useBoard();
  const [actionOpen, setActionOpen] = useState(false);

  const openImageAction = (action: "local" | "url" | "ai") => {
    setActionOpen(false);
    board.emit("context-menu:open-modal", {
      type: "image",
      action,
    });
  };

  const menuItems: ToolbarMenuItem[] = [
    {
      key: "local",
      label: "本地上传",
      icon: <Upload size={16} />,
      onSelect: () => openImageAction("local"),
    },
    {
      key: "url",
      label: "输入 URL",
      icon: <Link size={16} />,
      onSelect: () => openImageAction("url"),
    },
    {
      key: "ai",
      label: "AI 图片生成",
      icon: <Sparkles size={16} />,
      onSelect: () => openImageAction("ai"),
    },
  ];

  return (
    <Tooltip title="图片">
      <Popover
        open={actionOpen}
        onOpenChange={setActionOpen}
        trigger={"click"}
        placement="bottom"
        arrow={false}
        content={<ToolbarMenu items={menuItems} />}
        styles={{
          container: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
          },
        }}
      >
        <div className={className} style={style}>
          <SVG src={imageIcon} />
        </div>
      </Popover>
    </Tooltip>
  );
};

export default Image;
