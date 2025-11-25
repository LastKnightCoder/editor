import { useRef, useState } from "react";
import { App, Modal, Button } from "antd";
import { useMemoizedFn } from "ahooks";

import Board from "../../Board";
import { ImageUtil } from "../../utils";
import ResourcePickerModal from "@/components/ResourcePickerModal";
import type { IResource } from "@/types";

interface ImageSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
}

const ImageSelectorModal = ({
  open,
  onClose,
  board,
}: ImageSelectorModalProps) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
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
      onClose();
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
        onClose();
      }
    },
  );

  const handleLocalUpload = useMemoizedFn(() => {
    imageInputRef.current?.click();
  });

  const handleOpenResourcePicker = useMemoizedFn(() => {
    setResourcePickerOpen(true);
  });

  const handleCancel = useMemoizedFn(() => {
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
      <Modal
        title="插入图片"
        open={open}
        onCancel={handleCancel}
        footer={null}
        width={300}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "12px 0",
          }}
        >
          <Button block onClick={handleLocalUpload}>
            本地上传
          </Button>
          <Button block onClick={handleOpenResourcePicker}>
            资源库
          </Button>
        </div>
      </Modal>
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

export default ImageSelectorModal;
