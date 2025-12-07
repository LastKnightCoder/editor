import { useRef, useEffect, useState } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";

import Board from "../../Board";
import { ImageUtil } from "../../utils";
import ResourcePickerModal from "@/components/ResourcePickerModal";
import type { IResource } from "@/types";

interface ImageSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: string; // "local" | "resource"
}

const ImageSelectorModal = ({
  open,
  onClose,
  board,
  action,
}: ImageSelectorModalProps) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);

  const { message } = App.useApp();

  // 根据 action 自动触发对应操作
  useEffect(() => {
    if (!open) return;

    if (action === "local") {
      // 直接触发本地上传
      imageInputRef.current?.click();
    } else if (action === "resource") {
      // 打开资源库
      setResourcePickerOpen(true);
    }
  }, [open, action]);

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
      onClose();
    },
  );

  const handleSelectFromResource = useMemoizedFn(
    async (resources: IResource[]) => {
      if (!resources.length) {
        setResourcePickerOpen(false);
        onClose();
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
        onClose();
      }
    },
  );

  const handleResourcePickerCancel = useMemoizedFn(() => {
    setResourcePickerOpen(false);
    onClose();
  });

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleAddImage}
      />
      <ResourcePickerModal
        open={resourcePickerOpen}
        onCancel={handleResourcePickerCancel}
        allowedTypes={["image"]}
        multiple
        title="选择图片"
        onConfirm={handleSelectFromResource}
      />
    </>
  );
};

export default ImageSelectorModal;
