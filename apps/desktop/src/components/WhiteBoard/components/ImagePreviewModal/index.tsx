import { memo, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { X } from "lucide-react";
import { IconButton } from "@tau/ui";
import PortalToBody from "@/components/PortalToBody";
import LocalImage from "@/components/LocalImage";

interface ImagePreviewModalProps {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
}

const ImagePreviewModal = memo((props: ImagePreviewModalProps) => {
  const { open, src, alt, onClose } = props;

  const handleClose = useMemoizedFn(() => {
    onClose();
  });

  const handleEscKeyDown = useMemoizedFn((event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    handleClose();
  });

  const stopPropagation = useMemoizedFn((event: React.SyntheticEvent) => {
    event.stopPropagation();
  });

  const handleOverlayWheel = useMemoizedFn((event: React.WheelEvent) => {
    event.stopPropagation();
  });

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEscKeyDown);
    return () => {
      document.removeEventListener("keydown", handleEscKeyDown);
    };
  }, [open, handleEscKeyDown]);

  if (!open || !src) {
    return null;
  }

  return (
    <PortalToBody>
      {/* 全屏看图：主题遮罩 + 居中原图，点空白 / × / Esc 关闭 */}
      <div
        className="bg-overlay fixed inset-0 z-[340] flex items-center justify-center"
        onClick={handleClose}
        onWheel={handleOverlayWheel}
      >
        <IconButton
          className="bg-surface enabled:hover:bg-surface-hover shadow-lift absolute right-4 top-4 size-8 rounded-full"
          aria-label="关闭图片预览"
          onClick={handleClose}
        >
          <X className="size-4" strokeWidth={1.75} />
        </IconButton>
        <div
          className="max-h-[90vh] max-w-[90vw] p-4"
          onClick={stopPropagation}
          onWheel={handleOverlayWheel}
        >
          <LocalImage
            url={src}
            alt={alt || "图片"}
            className="shadow-float rounded-tau-sm max-h-[85vh] max-w-[85vw] object-contain"
          />
        </div>
        {alt && (
          <div
            className="bg-surface text-ink-2 shadow-lift absolute bottom-4 left-1/2 max-w-[80vw] -translate-x-1/2 truncate rounded-full px-3.5 py-1.5 text-[12.5px]"
            onClick={stopPropagation}
          >
            {alt}
          </div>
        )}
      </div>
    </PortalToBody>
  );
});

export default ImagePreviewModal;
