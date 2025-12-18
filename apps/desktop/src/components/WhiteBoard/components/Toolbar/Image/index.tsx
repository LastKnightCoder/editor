import { useRef, useState } from "react";
import SVG from "react-inlinesvg";
import { App, Tooltip, Popover } from "antd";
import { useMemoizedFn } from "ahooks";
import { Upload, FolderOpen } from "lucide-react";
import imageIcon from "@/assets/white-board/image.svg";

import { useBoard } from "../../../hooks";
import { ImageUtil } from "../../../utils";
import ResourcePickerModal from "@/components/ResourcePickerModal";
import ToolbarMenu, { ToolbarMenuItem } from "../ToolbarMenu";
import type { IResource } from "@/types";

interface ImageProps {
  className?: string;
  style?: React.CSSProperties;
}

const Image = (props: ImageProps) => {
  const { className, style } = props;
  const board = useBoard();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);

  const { message } = App.useApp();

  const handleAddImage = useMemoizedFn(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        message.loading({
          key: "uploading-image",
          content: "正在处理图片，请稍候...",
          duration: 0,
        });
        await ImageUtil.insertImage(file, board);
        message.destroy("uploading-image");
      }
      event.target.value = "";
    },
  );

  const handleSelectFromResource = useMemoizedFn(
    async (resources: IResource[]) => {
      if (!resources.length) {
        setResourcePickerOpen(false);
        return;
      }
      message.loading({
        key: "uploading-image",
        content: "正在插入图片，请稍候...",
        duration: 0,
      });
      try {
        for (const resource of resources) {
          await ImageUtil.insertImageFromPath(resource.path, board);
        }
      } finally {
        message.destroy("uploading-image");
        setResourcePickerOpen(false);
      }
    },
  );

  const menuItems: ToolbarMenuItem[] = [
    {
      key: "local",
      label: "本地上传",
      icon: <Upload size={16} />,
      onSelect: () => {
        setActionOpen(false);
        imageInputRef.current?.click();
      },
    },
    {
      key: "library",
      label: "资源库",
      icon: <FolderOpen size={16} />,
      onSelect: () => {
        setActionOpen(false);
        setResourcePickerOpen(true);
      },
    },
  ];

  return (
    <>
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
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleAddImage}
            />
            <SVG src={imageIcon} />
          </div>
        </Popover>
      </Tooltip>
      <ResourcePickerModal
        open={resourcePickerOpen}
        onCancel={() => setResourcePickerOpen(false)}
        allowedTypes={["image"]}
        multiple
        title="选择图片"
        onConfirm={handleSelectFromResource}
      />
    </>
  );
};

export default Image;
