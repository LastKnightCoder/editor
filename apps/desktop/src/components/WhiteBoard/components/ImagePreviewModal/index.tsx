import { memo, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
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
    event.preventDefault();
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
      <div
        className="fixed inset-0 z-11000 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
        onWheel={handleOverlayWheel}
      >
        <button
          type="button"
          className="absolute top-4 right-4 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white text-xl leading-none"
          aria-label="关闭图片预览"
          onClick={handleClose}
        >
          ×
        </button>
        <div
          className="max-h-[90vh] max-w-[90vw] p-4"
          onClick={stopPropagation}
          onWheel={handleOverlayWheel}
        >
          <LocalImage
            url={src}
            alt={alt || "图片"}
            className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/50 text-white text-sm max-w-[80vw] truncate">
          {alt || "图片"}
        </div>
      </div>
    </PortalToBody>
  );
});

export default ImagePreviewModal;
