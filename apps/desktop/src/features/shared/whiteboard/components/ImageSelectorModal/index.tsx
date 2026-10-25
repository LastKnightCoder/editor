import { whiteboardMedia, prepareWhiteboardImage } from "../../media";
import { useRef, useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";

import { Board as Board } from "@tau/whiteboard";
import { ImageUtil } from "@tau/whiteboard";
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
      const toastId = toast.loading("正在处理图片，请稍候…");
      try {
        await ImageUtil.insertImage(file, board, whiteboardMedia(board));
      } finally {
        toast.dismiss(toastId);
      }
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
    toast.success("图片已插入");
    setUrlModalOpen(false);
    onClose();
  });

  const handleGenerateAIImage = useMemoizedFn(async (prompt: string, signal: AbortSignal) => {
    const result = await generateWhiteboardImage(prompt, signal);
    signal.throwIfAborted();
    await ImageUtil.insertImageFromPath(await prepareWhiteboardImage(board, result.url), board);
    toast.success("图片已生成并插入");
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
