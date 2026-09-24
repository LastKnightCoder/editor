import { useRef, useEffect, useState } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";

import Board from "../../Board";
import { ImageUtil } from "../../utils";
import ImageAIGenerateModal from "./ImageAIGenerateModal";
import ImageUrlModal from "./ImageUrlModal";
import { generateWhiteboardImage } from "./imageActions";

interface ImageSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
  action?: string; // "local" | "url" | "ai"
}

const ImageSelectorModal = ({ open, onClose, board, action }: ImageSelectorModalProps) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);

  const { message } = App.useApp();

  // 根据 action 自动触发对应操作
  useEffect(() => {
    if (!open) return;

    if (action === "local") {
      // 直接触发本地上传
      imageInputRef.current?.click();
    } else if (action === "url") {
      setUrlModalOpen(true);
    } else if (action === "ai") {
      setAiGenerateOpen(true);
    }
  }, [open, action]);

  const handleAddImage = useMemoizedFn(async (event: React.ChangeEvent<HTMLInputElement>) => {
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
  });

  const handleUrlModalCancel = useMemoizedFn(() => {
    setUrlModalOpen(false);
    onClose();
  });

  const handleAIGenerateCancel = useMemoizedFn(() => {
    setAiGenerateOpen(false);
    onClose();
  });

  const handleInsertFromUrl = useMemoizedFn(async (url: string) => {
    await ImageUtil.insertImageFromPath(url, board);
    message.success("图片已插入");
    setUrlModalOpen(false);
    onClose();
  });

  const handleGenerateAIImage = useMemoizedFn(async (prompt: string) => {
    const result = await generateWhiteboardImage(prompt);
    await ImageUtil.insertImageFromPath(result.url, board);
    message.success("图片已生成并插入");
    setAiGenerateOpen(false);
    onClose();
  });

  return (
    <>
      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleAddImage} />
      <ImageUrlModal
        open={urlModalOpen}
        onCancel={handleUrlModalCancel}
        onConfirm={handleInsertFromUrl}
      />
      <ImageAIGenerateModal
        open={aiGenerateOpen}
        onCancel={handleAIGenerateCancel}
        onConfirm={handleGenerateAIImage}
      />
    </>
  );
};

export default ImageSelectorModal;
